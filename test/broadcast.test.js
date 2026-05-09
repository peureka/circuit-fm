const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/broadcast");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");
const { createFakeResend } = require("./helpers/fakeResend");

const SECRET = "broadcast-test-secret";
const SEGMENT_ID = "seg_test";

function makeFakeCircuit({ throwOnCreate } = {}) {
  const calls = [];
  return {
    calls,
    async createCampaign(args) {
      calls.push(args);
      if (throwOnCreate) {
        throw new Error("circuit /api/organiser/v1/campaigns failed: " + throwOnCreate);
      }
      return { id: "cmp_1", status: "draft", createdAt: "2026-04-24T00:00:00.000Z" };
    },
  };
}

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  const resend = overrides.resend || createFakeResend();
  const circuitClient = overrides.circuitClient || makeFakeCircuit();
  return {
    handler: createHandler({
      circuitClient,
      db,
      resend,
      adminSecret: SECRET,
      fromAddress: "Circuit <test@circuit.fm>",
      segmentId: SEGMENT_ID,
      ...overrides,
    }),
    db,
    resend,
    circuitClient,
  };
}

function authedReq(body) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
    body,
  };
}

test("POST without auth returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "POST", body: { template: "shortlist" } }, res);
  assert.equal(res.statusCode, 401);
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

test("POST without template/subject/data returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(authedReq({ template: "shortlist" }), res);
  assert.equal(res.statusCode, 400);
});

test("POST with unknown template returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    authedReq({ template: "unknown", subject: "s", data: {} }),
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST happy path: Resend dispatch + Circuit Campaign audit + outing status update", async () => {
  const db = createFakeFirestore();
  await db.collection("outings").doc("out-1").set({ status: "draft" });
  await db.collection("outings").doc("out-2").set({ status: "draft" });

  const { handler, resend, circuitClient } = makeHandler({ db });
  const res = createFakeRes();

  await handler(
    authedReq({
      template: "shortlist",
      subject: "Three picks for Saturday",
      data: { format: "Salon", day: "Saturday", options: [{ name: "X", description: "Y", venue: "Z", rsvpUrl: "https://example.com" }] },
      outingIds: ["out-1", "out-2"],
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.broadcastId, "b_1");
  assert.equal(res.body.circuitCampaignId, "cmp_1");
  assert.equal(res.body.warning, null);

  // Resend was used to dispatch
  assert.equal(resend._calls.broadcastCreates.length, 1);
  assert.equal(resend._calls.broadcastCreates[0].segmentId, SEGMENT_ID);
  assert.equal(resend._calls.broadcastCreates[0].subject, "Three picks for Saturday");
  assert.equal(resend._calls.broadcastSends.length, 1);
  assert.equal(resend._calls.broadcastSends[0].broadcastId, "b_1");

  // Circuit got the audit record with the Resend back-reference
  assert.equal(circuitClient.calls.length, 1);
  assert.equal(circuitClient.calls[0].subject, "Three picks for Saturday");
  assert.equal(
    circuitClient.calls[0].segmentFilters.resendBroadcastId,
    "b_1",
  );
  assert.deepEqual(
    circuitClient.calls[0].segmentFilters.outingIds,
    ["out-1", "out-2"],
  );

  // Firestore outings flipped to broadcast (Culture Club state)
  const o1 = await db.collection("outings").doc("out-1").get();
  assert.equal(o1.data().status, "broadcast");
  const o2 = await db.collection("outings").doc("out-2").get();
  assert.equal(o2.data().status, "broadcast");
});

test("POST returns warning when Circuit audit write fails but Resend succeeded", async () => {
  const circuitClient = makeFakeCircuit({ throwOnCreate: "upstream 500" });
  const { handler, resend } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler(
    authedReq({
      template: "shortlist",
      subject: "s",
      data: { format: "Salon", day: "Saturday", options: [] },
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.broadcastId, "b_1");
  assert.equal(res.body.circuitCampaignId, null);
  assert.equal(res.body.warning, "circuit_audit_unavailable");
  assert.equal(resend._calls.broadcastSends.length, 1);
});

test("POST without outingIds doesn't touch Firestore outings", async () => {
  const db = createFakeFirestore();
  await db.collection("outings").doc("out-x").set({ status: "draft" });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler(
    authedReq({
      template: "shortlist",
      subject: "s",
      data: { format: "Salon", day: "Saturday", options: [] },
    }),
    res,
  );

  const ox = await db.collection("outings").doc("out-x").get();
  assert.equal(ox.data().status, "draft");
});
