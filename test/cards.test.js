const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/cards");
const { createFakeRes } = require("./helpers/fakeRes");

const SECRET = "cards-test-secret";

function makeFakeCircuit({ pages = [{ items: [], nextCursor: null }] } = {}) {
  let pageIdx = 0;
  return {
    async listCards() {
      const p = pages[pageIdx] || { items: [], nextCursor: null };
      pageIdx++;
      return p;
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
  };
}

function authed(method) {
  return {
    method,
    headers: { authorization: `Bearer ${SECRET}` },
  };
}

test("GET returns empty list when there are no reservations", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(authed("GET"), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.cards, []);
  assert.deepEqual(res.body.counts, {
    total: 0,
    unassigned: 0,
    active: 0,
    lost: 0,
    disabled: 0,
  });
});

test("GET maps reservation rows to admin shape and sorts by status then chipUid", async () => {
  const circuitClient = makeFakeCircuit({
    pages: [
      {
        items: [
          {
            chipUid: "u1",
            memberCode: "M_U1",
            voided: false,
            reservedAt: "2026-04-01T00:00:00.000Z",
            claim: null,
          },
          {
            chipUid: "a1",
            memberCode: "M_A1",
            voided: false,
            reservedAt: "2026-04-02T00:00:00.000Z",
            claim: {
              claimedAt: "2026-04-03T00:00:00.000Z",
              globalProfile: { id: "gp-1", displayName: "Naia" },
            },
          },
          {
            chipUid: "u2",
            memberCode: "M_U2",
            voided: false,
            reservedAt: "2026-04-04T00:00:00.000Z",
            claim: null,
          },
          {
            chipUid: "d1",
            memberCode: "M_D1",
            voided: true,
            reservedAt: "2026-04-05T00:00:00.000Z",
            claim: null,
          },
        ],
        nextCursor: null,
      },
    ],
  });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();
  await handler(authed("GET"), res);

  assert.equal(res.statusCode, 200);
  // Sorted: unassigned first (alpha), then active, then disabled.
  assert.deepEqual(
    res.body.cards.map((c) => c.chipUid),
    ["u1", "u2", "a1", "d1"],
  );
  assert.equal(res.body.cards[2].member_id, "gp-1");
  assert.equal(res.body.cards[2].member_name, "Naia");
  assert.deepEqual(res.body.counts, {
    total: 4,
    unassigned: 2,
    active: 1,
    lost: 0,
    disabled: 1,
  });
});

test("GET pages through cursor responses", async () => {
  const circuitClient = makeFakeCircuit({
    pages: [
      {
        items: [
          {
            chipUid: "p1",
            memberCode: "M1",
            voided: false,
            reservedAt: "2026-04-01T00:00:00.000Z",
            claim: null,
          },
        ],
        nextCursor: "cursor-2",
      },
      {
        items: [
          {
            chipUid: "p2",
            memberCode: "M2",
            voided: false,
            reservedAt: "2026-04-02T00:00:00.000Z",
            claim: null,
          },
        ],
        nextCursor: null,
      },
    ],
  });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();
  await handler(authed("GET"), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.cards.length, 2);
});

test("GET falls back to FALLBACK_MEMBER_NAME when displayName is null", async () => {
  const circuitClient = makeFakeCircuit({
    pages: [
      {
        items: [
          {
            chipUid: "x1",
            memberCode: "MX",
            voided: false,
            reservedAt: "2026-04-01T00:00:00.000Z",
            claim: {
              claimedAt: "2026-04-02T00:00:00.000Z",
              globalProfile: { id: "gp-x", displayName: null },
            },
          },
        ],
        nextCursor: null,
      },
    ],
  });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();
  await handler(authed("GET"), res);
  assert.equal(res.body.cards[0].member_name, "A Circuit member");
});

test("GET without auth returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 401);
});

test("POST returns 405", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    { method: "POST", headers: { authorization: `Bearer ${SECRET}` } },
    res,
  );
  assert.equal(res.statusCode, 405);
});
