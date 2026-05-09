const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/c/[chipUid].js");
const { createFakeRes } = require("./helpers/fakeRes");

// Fake the Circuit organiser API client for the legacy /c/<chipUid> path.
// Maps chipUid -> reservation row in the same shape lookupCardByChip
// returns. `null` means 404 (not found OR cross-tenant — both surface as
// null per the API contract).
function makeFakeCircuit({ byChip = {} } = {}) {
  return {
    async lookupCardByChip(chipUid) {
      return Object.prototype.hasOwnProperty.call(byChip, chipUid)
        ? byChip[chipUid]
        : null;
    },
  };
}

function makeHandler(overrides = {}) {
  const circuitClient = overrides.circuitClient || makeFakeCircuit();
  return {
    handler: createHandler({ circuitClient, ...overrides }),
    circuitClient,
  };
}

function reservation({
  memberCode = "mbr_TEST",
  chipUid = "chip-x",
  voided = false,
  claim = null,
} = {}) {
  return { memberCode, chipUid, voided, claim };
}

function claim({ id = "gp-1", displayName = null, photoUrl = null } = {}) {
  return {
    claimedAt: "2026-04-24T00:00:00.000Z",
    globalProfile: { id, displayName, photoUrl },
  };
}

test("GET with a valid active card renders HTML naming the vouching member", async () => {
  const circuitClient = makeFakeCircuit({
    byChip: {
      "abc-123": reservation({
        chipUid: "abc-123",
        claim: claim({ id: "member-1", displayName: "Ada Lovelace" }),
      }),
    },
  });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "abc-123" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
  assert.match(res.body, /Ada Lovelace/);
  assert.match(res.body, /gave you their card/);
  assert.match(res.body, /That's how Circuit works/);
  assert.match(res.body, /\/\?v=member-1/);
});

test("GET with unknown chipUid returns 404 HTML", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "nope-nope" } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
});

test("GET with a voided reservation returns 410", async () => {
  const circuitClient = makeFakeCircuit({
    byChip: {
      "lost-card": reservation({
        chipUid: "lost-card",
        voided: true,
        claim: claim({ id: "member-2", displayName: "Someone" }),
      }),
    },
  });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "lost-card" } }, res);

  assert.equal(res.statusCode, 410);
});

test("GET with an unbound (provisioned but never claimed) reservation returns 404", async () => {
  const circuitClient = makeFakeCircuit({
    byChip: {
      "unbound": reservation({ chipUid: "unbound", claim: null }),
    },
  });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "unbound" } }, res);

  assert.equal(res.statusCode, 404);
});

test("GET surfaces 500 when the upstream lookup throws", async () => {
  const circuitClient = {
    async lookupCardByChip() {
      throw new Error("upstream timeout");
    },
  };
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "boom" } }, res);

  assert.equal(res.statusCode, 500);
});

test("POST returns 405 with Allow: GET, HEAD", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();

  await handler({ method: "POST", query: { chipUid: "abc" } }, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers["Allow"], "GET, HEAD");
});

test("HEAD with valid chipUid returns 200 with no body and skips upstream lookup", async () => {
  let lookupCalls = 0;
  const circuitClient = {
    async lookupCardByChip() {
      lookupCalls++;
      return null;
    },
  };
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler({ method: "HEAD", query: { chipUid: "any-shape" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null, "HEAD must not write a body");
  assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
  assert.equal(res.ended, true);
  assert.equal(lookupCalls, 0, "HEAD must skip upstream lookup");
});

test("HEAD with missing chipUid returns 400 with no body", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();

  await handler({ method: "HEAD", query: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body, null);
  assert.equal(res.ended, true);
});

test("GET with missing chipUid returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();

  await handler({ method: "GET", query: {} }, res);

  assert.equal(res.statusCode, 400);
});

test("member name with HTML-special chars is escaped", async () => {
  const circuitClient = makeFakeCircuit({
    byChip: {
      "xss-card": reservation({
        chipUid: "xss-card",
        claim: claim({
          id: "xss-member",
          displayName: "<script>alert(1)</script>",
        }),
      }),
    },
  });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "xss-card" } }, res);

  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, /<script>alert\(1\)<\/script>/);
  assert.match(res.body, /&lt;script&gt;/);
});

test("member without a displayName falls back to a generic label", async () => {
  const circuitClient = makeFakeCircuit({
    byChip: {
      "nameless-card": reservation({
        chipUid: "nameless-card",
        claim: claim({ id: "nameless-member", displayName: null }),
      }),
    },
  });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "nameless-card" } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Circuit member/);
});
