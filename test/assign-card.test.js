const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/assign-card");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

const VALID_SECRET = "admin-test-secret";

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  let counter = 0;
  const deps = {
    db,
    adminSecret: VALID_SECRET,
    timestamp: () => new Date("2026-04-24T00:00:00Z"),
    generateId: () => `member-${++counter}`,
    ...overrides,
  };
  return { handler: createHandler(deps), db };
}

function authedReq(body) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${VALID_SECRET}` },
    body,
  };
}

test("POST with auth + valid body creates member and card, returns ids", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();

  await handler(
    authedReq({
      chipUid: "chip-uuid-001",
      email: "ada@example.com",
      name: "Ada Lovelace",
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.chipUid, "chip-uuid-001");
  assert.equal(res.body.email, "ada@example.com");
  assert.equal(res.body.member_id, "member-1");

  // Verify card doc
  const card = await db.collection("cards").doc("chip-uuid-001").get();
  assert.equal(card.exists, true);
  assert.equal(card.data().member_id, "member-1");
  assert.equal(card.data().status, "active");
  assert.ok(card.data().issued_at);

  // Verify member doc
  const member = await db.collection("members").doc("member-1").get();
  assert.equal(member.exists, true);
  assert.equal(member.data().email, "ada@example.com");
  assert.equal(member.data().name, "Ada Lovelace");

  // Verify signups doc has member_id backreference
  const signup = await db.collection("signups").doc("ada@example.com").get();
  assert.equal(signup.exists, true);
  assert.equal(signup.data().member_id, "member-1");
});

test("POST without auth returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { chipUid: "c1", email: "e@x.com", name: "n" },
    },
    res,
  );
  assert.equal(res.statusCode, 401);
});

test("POST with wrong auth returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
      body: { chipUid: "c1", email: "e@x.com", name: "n" },
    },
    res,
  );
  assert.equal(res.statusCode, 401);
});

test("POST missing chipUid returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    authedReq({ email: "e@x.com", name: "n" }),
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST invalid email returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    authedReq({ chipUid: "c1", email: "not-email", name: "n" }),
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST with chipUid already assigned returns 409", async () => {
  const db = createFakeFirestore();
  // Pre-seed an already-assigned card
  await db.collection("cards").doc("chip-used").set({
    member_id: "someone-else",
    status: "active",
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(
    authedReq({
      chipUid: "chip-used",
      email: "new@example.com",
      name: "New Person",
    }),
    res,
  );
  assert.equal(res.statusCode, 409);
});

test("POST with email already a member returns 409", async () => {
  const db = createFakeFirestore();
  await db.collection("signups").doc("already@example.com").set({
    email: "already@example.com",
    name: "Already",
    member_id: "member-existing",
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(
    authedReq({
      chipUid: "chip-fresh",
      email: "already@example.com",
      name: "Already",
    }),
    res,
  );
  assert.equal(res.statusCode, 409);
});

test("If signup already has a name, assign-card uses it when none provided", async () => {
  const db = createFakeFirestore();
  await db.collection("signups").doc("preset@example.com").set({
    email: "preset@example.com",
    name: "Preset Name",
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(
    authedReq({
      chipUid: "chip-preset",
      email: "preset@example.com",
      // no name provided
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  const member = await db.collection("members").doc("member-1").get();
  assert.equal(member.data().name, "Preset Name");
});

test("POST with no signup and no name returns 400 (need a name)", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    authedReq({ chipUid: "c1", email: "nameless@example.com" }),
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("GET returns 405", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    { method: "GET", headers: { authorization: `Bearer ${VALID_SECRET}` } },
    res,
  );
  assert.equal(res.statusCode, 405);
});

test("Email is normalised to lowercase throughout", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    authedReq({
      chipUid: "c-case",
      email: "MixedCase@Example.com",
      name: "Case Test",
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  const member = await db.collection("members").doc("member-1").get();
  assert.equal(member.data().email, "mixedcase@example.com");
  const signup = await db.collection("signups").doc("mixedcase@example.com").get();
  assert.equal(signup.exists, true);
});

// ---- vouch status advancement (tapped / floor -> voucher) ----

test("Assign-card advances tapped vouches to voucher", async () => {
  const db = createFakeFirestore();
  // Pre-seed a vouch at tapped — the new member was vouched by member-ada
  await db.collection("vouches").doc("member-ada__new@example.com").set({
    from_member_id: "member-ada",
    recipient_email: "new@example.com",
    status: "tapped",
    created_at: new Date(),
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(
    authedReq({
      chipUid: "new-chip",
      email: "new@example.com",
      name: "New Member",
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.vouches_advanced, 1);

  const vouch = await db
    .collection("vouches")
    .doc("member-ada__new@example.com")
    .get();
  assert.equal(vouch.data().status, "voucher");
  assert.ok(vouch.data().voucher_at);
});

test("Assign-card advances floor vouches to voucher (skipping tapped)", async () => {
  const db = createFakeFirestore();
  await db.collection("vouches").doc("v1__r@x.com").set({
    from_member_id: "v1",
    recipient_email: "r@x.com",
    status: "floor",
    floor_at: new Date(),
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(
    authedReq({ chipUid: "c1", email: "r@x.com", name: "Recipient" }),
    res,
  );

  assert.equal(res.statusCode, 200);
  const vouch = await db.collection("vouches").doc("v1__r@x.com").get();
  assert.equal(vouch.data().status, "voucher");
});

test("Assign-card does NOT touch vouches already at voucher status", async () => {
  const db = createFakeFirestore();
  await db.collection("vouches").doc("v1__e@x.com").set({
    from_member_id: "v1",
    recipient_email: "e@x.com",
    status: "voucher",
    voucher_at: new Date("2026-04-25T00:00:00Z"),
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(
    authedReq({ chipUid: "c1", email: "e@x.com", name: "E" }),
    res,
  );

  assert.equal(res.body.vouches_advanced, 0);
});

test("Assign-card with no matching vouches reports 0 advanced", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    authedReq({
      chipUid: "solo-chip",
      email: "solo@example.com",
      name: "Solo",
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.vouches_advanced, 0);
});

test("Multiple vouches for the same recipient all advance to voucher", async () => {
  // Edge case: same person got vouched by two different members.
  // When they get their card, both vouchers should be credited.
  const db = createFakeFirestore();
  await db.collection("vouches").doc("v-a__popular@x.com").set({
    from_member_id: "v-a",
    recipient_email: "popular@x.com",
    status: "tapped",
  });
  await db.collection("vouches").doc("v-b__popular@x.com").set({
    from_member_id: "v-b",
    recipient_email: "popular@x.com",
    status: "floor",
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(
    authedReq({
      chipUid: "chip-p",
      email: "popular@x.com",
      name: "Popular",
    }),
    res,
  );

  assert.equal(res.body.vouches_advanced, 2);
  const va = await db.collection("vouches").doc("v-a__popular@x.com").get();
  const vb = await db.collection("vouches").doc("v-b__popular@x.com").get();
  assert.equal(va.data().status, "voucher");
  assert.equal(vb.data().status, "voucher");
});
