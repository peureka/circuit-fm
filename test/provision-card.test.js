const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/provision-card");
const { createFakeRes } = require("./helpers/fakeRes");

const SECRET = "prov-test-secret";

function makeFakeCircuit({ reservedChips = new Set() } = {}) {
  const calls = [];
  return {
    calls,
    reservedChips,
    async reserveCard({ chipUid }) {
      calls.push({ chipUid });
      if (reservedChips.has(chipUid)) {
        const err = new Error(
          `circuit /api/organiser/v1/cards/reserve failed [CONFLICT]: memberCode or chipUid already exists`,
        );
        throw err;
      }
      reservedChips.add(chipUid);
      return { memberCode: `mbr_${chipUid}`, chipUid, reservedAt: new Date().toISOString() };
    },
  };
}

function makeHandler(overrides = {}) {
  const circuitClient = overrides.circuitClient || makeFakeCircuit();
  return {
    handler: createHandler({
      circuitClient,
      adminSecret: SECRET,
      ...overrides,
    }),
    circuitClient,
  };
}

function authed(body) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
    body,
  };
}

test("POST with chipUids array reserves cards via Circuit", async () => {
  const { handler, circuitClient } = makeHandler();
  const res = createFakeRes();

  await handler(authed({ chipUids: ["chip-a", "chip-b", "chip-c"] }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.created, 3);
  assert.equal(res.body.skipped, 0);
  assert.equal(circuitClient.calls.length, 3);
  assert.deepEqual(
    circuitClient.calls.map((c) => c.chipUid),
    ["chip-a", "chip-b", "chip-c"],
  );
});

test("POST treats Circuit CONFLICT response as skipped (idempotent)", async () => {
  const fake = makeFakeCircuit({ reservedChips: new Set(["chip-a"]) });
  const { handler } = makeHandler({ circuitClient: fake });
  const res = createFakeRes();

  await handler(authed({ chipUids: ["chip-a", "chip-b"] }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.created, 1);
  assert.equal(res.body.skipped, 1);
});

test("POST without auth returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "POST", body: { chipUids: ["x"] } }, res);
  assert.equal(res.statusCode, 401);
});

test("POST with empty chipUids array returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(authed({ chipUids: [] }), res);
  assert.equal(res.statusCode, 400);
});

test("POST with non-array chipUids returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(authed({ chipUids: "not-array" }), res);
  assert.equal(res.statusCode, 400);
});

test("POST trims and dedups whitespace / duplicate chipUids", async () => {
  const { handler, circuitClient } = makeHandler();
  const res = createFakeRes();
  await handler(
    authed({ chipUids: ["chip-1", "  chip-1  ", "chip-2", ""] }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.created, 2);
  assert.equal(circuitClient.calls.length, 2);
});

test("POST reports unexpected errors in `errors` array (non-conflict failures)", async () => {
  const fake = {
    calls: [],
    async reserveCard({ chipUid }) {
      this.calls.push({ chipUid });
      throw new Error("upstream 500");
    },
  };
  const { handler } = makeHandler({ circuitClient: fake });
  const res = createFakeRes();
  await handler(authed({ chipUids: ["chip-a"] }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.created, 0);
  assert.equal(res.body.skipped, 0);
  assert.equal(res.body.failed, 1);
  assert.equal(res.body.errors[0].chipUid, "chip-a");
});

test("GET returns 405", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    { method: "GET", headers: { authorization: `Bearer ${SECRET}` } },
    res,
  );
  assert.equal(res.statusCode, 405);
});
