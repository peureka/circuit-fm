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
