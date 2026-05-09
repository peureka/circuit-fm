const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/assign-card");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

const VALID_SECRET = "admin-test-secret";

function makeFakeCircuit({ throwOn } = {}) {
  const calls = [];
  return {
    calls,
    async assignCardByChip({ chipUid, email, displayName }) {
      calls.push({ chipUid, email, displayName });
      if (throwOn === "conflict") {
        throw new Error(
          "circuit /api/organiser/v1/cards/by-chip/X/assign failed [CONFLICT]: Card already claimed by a different member",
        );
      }
      if (throwOn === "not_found") {
        throw new Error(
          "circuit /api/organiser/v1/cards/by-chip/X/assign failed [NOT_FOUND]: Card not found",
        );
      }
      return {
        memberCode: `mbr_${chipUid.toUpperCase()}`,
        chipUid,
        claim: {
          claimedAt: "2026-04-24T00:00:00.000Z",
          globalProfileId: "gp-from-circuit",
        },
        created: true,
      };
    },
  };
}

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  const circuitClient = overrides.circuitClient || makeFakeCircuit();
  return {
    handler: createHandler({
      circuitClient,
      db,
      adminSecret: VALID_SECRET,
      timestamp: () => new Date("2026-04-24T00:00:00Z"),
      ...overrides,
    }),
    db,
    circuitClient,
  };
}

function authedReq(body) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${VALID_SECRET}` },
    body,
  };
}

test("POST with auth + valid body delegates to Circuit and writes signup back-ref", async () => {
  const { handler, db, circuitClient } = makeHandler();
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
  assert.equal(res.body.member_id, "gp-from-circuit");
  assert.equal(res.body.circuit_member_code, "mbr_CHIP-UUID-001");
  assert.equal(res.body.email, "ada@example.com");
  assert.equal(res.body.created, true);

  // Circuit was called with the right arguments
  assert.equal(circuitClient.calls.length, 1);
  assert.deepEqual(circuitClient.calls[0], {
    chipUid: "chip-uuid-001",
    email: "ada@example.com",
    displayName: "Ada Lovelace",
  });

  // Signup doc has the back-reference
  const signup = await db.collection("signups").doc("ada@example.com").get();
  assert.equal(signup.data().member_id, "gp-from-circuit");
  assert.equal(signup.data().circuit_member_code, "mbr_CHIP-UUID-001");
});

test("POST with auth + valid body advances tapped+floor vouches to voucher", async () => {
  const db = createFakeFirestore();
  // Pre-seed two vouches for this email
  await db.collection("vouches").doc("v-tap").set({
    recipient_email: "ada@example.com",
    status: "tapped",
  });
  await db.collection("vouches").doc("v-floor").set({
    recipient_email: "ada@example.com",
    status: "floor",
  });
  // And one already at voucher (should not change)
  await db.collection("vouches").doc("v-already").set({
    recipient_email: "ada@example.com",
    status: "voucher",
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(
    authedReq({ chipUid: "chip-1", email: "ada@example.com", name: "Ada" }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.vouches_advanced, 2);

  const tap = await db.collection("vouches").doc("v-tap").get();
  assert.equal(tap.data().status, "voucher");
  assert.ok(tap.data().voucher_at);

  const floor = await db.collection("vouches").doc("v-floor").get();
  assert.equal(floor.data().status, "voucher");

  const already = await db.collection("vouches").doc("v-already").get();
  assert.equal(already.data().status, "voucher"); // unchanged
  assert.equal(already.data().voucher_at, undefined);
});

test("POST returns 409 when Circuit reports CONFLICT", async () => {
  const circuitClient = makeFakeCircuit({ throwOn: "conflict" });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();
  await handler(
    authedReq({ chipUid: "chip-x", email: "x@y.com", name: "X" }),
    res,
  );
  assert.equal(res.statusCode, 409);
});

test("POST returns 404 when Circuit reports NOT_FOUND", async () => {
  const circuitClient = makeFakeCircuit({ throwOn: "not_found" });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();
  await handler(
    authedReq({ chipUid: "chip-x", email: "x@y.com", name: "X" }),
    res,
  );
  assert.equal(res.statusCode, 404);
});

test("POST resolves displayName from existing signup if not in request", async () => {
  const db = createFakeFirestore();
  await db.collection("signups").doc("seeded@example.com").set({
    name: "Seeded Name",
    email: "seeded@example.com",
  });

  const { handler, circuitClient } = makeHandler({ db });
  const res = createFakeRes();
  await handler(
    authedReq({ chipUid: "chip-s", email: "seeded@example.com" }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(circuitClient.calls[0].displayName, "Seeded Name");
});

test("POST returns 400 when no name in request and no signup on file", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    authedReq({ chipUid: "c", email: "nobody@x.com" }),
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST without auth returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    { method: "POST", body: { chipUid: "c", email: "x@y.com", name: "x" } },
    res,
  );
  assert.equal(res.statusCode, 401);
});

test("POST with invalid email returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    authedReq({ chipUid: "c", email: "not-an-email", name: "x" }),
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
