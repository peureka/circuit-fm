const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/broadcast");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");
const { createFakeResend } = require("./helpers/fakeResend");

const SECRET = "broadcast-test-secret";
const CONFIRM = "broadcast-test-confirm";
const SEGMENT_ID = "seg_test";

function makeFakeCircuit({ throwOnCreate, recentSends = [] } = {}) {
  const calls = [];
  return {
    calls,
    async listCampaigns() {
      // recentSends is an array of ISO strings (sentAt values).
      return { items: recentSends.map((sentAt, i) => ({ id: `c${i}`, sentAt })), nextCursor: null };
    },
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
      confirmToken: CONFIRM,
      fromAddress: "Circuit <test@circuit.fm>",
      segmentId: SEGMENT_ID,
      maxPerHour: 4,
      maxPerDay: 5,
      now: () => new Date("2026-05-09T12:00:00.000Z"),
      ...overrides,
    }),
    db,
    resend,
    circuitClient,
  };
}

function fullPayload() {
  return {
    template: "shortlist",
    subject: "Three picks for Saturday",
    data: {
      format: "Salon",
      day: "Saturday",
      options: [
        {
          name: "X",
          description: "Y",
          venue: "Z",
          rsvpUrl: "https://example.com",
        },
      ],
    },
  };
}

function authedReq(body, headers = {}) {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${SECRET}`,
      "x-broadcast-confirm": CONFIRM,
      ...headers,
    },
    body,
  };
}

// ─── Auth gates ────────────────────────────────────────────────────────

test("POST without Authorization returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "POST", body: fullPayload() }, res);
  assert.equal(res.statusCode, 401);
});

test("POST without X-Broadcast-Confirm returns 401 (two-key send)", async () => {
  const { handler, resend } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
      body: fullPayload(),
    },
    res,
  );
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /X-Broadcast-Confirm/);
  // Critically, the cost-bearing Resend call must NOT have happened.
  assert.equal(resend._calls.broadcastCreates, undefined);
});

test("POST with wrong X-Broadcast-Confirm returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    authedReq(fullPayload(), { "x-broadcast-confirm": "WRONG" }),
    res,
  );
  assert.equal(res.statusCode, 401);
});

test("Refuses to start when BROADCAST_CONFIRM_TOKEN equals BROADCAST_SECRET", async () => {
  const { handler } = makeHandler({ confirmToken: SECRET });
  const res = createFakeRes();
  await handler(authedReq(fullPayload()), res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /distinct/);
});

test("Refuses to start when BROADCAST_CONFIRM_TOKEN is unset", async () => {
  const { handler } = makeHandler({ confirmToken: undefined });
  const res = createFakeRes();
  await handler(authedReq(fullPayload()), res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /Missing BROADCAST_CONFIRM_TOKEN/);
});

// ─── Method + payload validation ───────────────────────────────────────

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

// ─── Rate limit + daily cap ────────────────────────────────────────────

test("Returns 429 rate_limited when hourly cap is reached", async () => {
  // 4 sends in the last 30 minutes — at the limit.
  const recentSends = [
    "2026-05-09T11:55:00.000Z",
    "2026-05-09T11:50:00.000Z",
    "2026-05-09T11:45:00.000Z",
    "2026-05-09T11:40:00.000Z",
  ];
  const circuitClient = makeFakeCircuit({ recentSends });
  const { handler, resend } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler(authedReq(fullPayload()), res);

  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, "rate_limited");
  // No Resend dispatch on rate-limited path.
  assert.equal(resend._calls.broadcastCreates, undefined);
});

test("Allows send when older sends fall outside the 1h window", async () => {
  // Sends from > 1h ago shouldn't count toward the hourly limit.
  const recentSends = [
    "2026-05-09T10:30:00.000Z", // 1h30 ago — outside window
    "2026-05-09T10:00:00.000Z", // 2h ago
  ];
  const circuitClient = makeFakeCircuit({ recentSends });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler(authedReq(fullPayload()), res);
  assert.equal(res.statusCode, 200);
});

test("Returns 429 daily_cap when UTC daily cap is reached", async () => {
  // 5 sends today (UTC). Hourly cap is 4, so spread them across the day.
  const recentSends = [
    "2026-05-09T01:00:00.000Z",
    "2026-05-09T03:00:00.000Z",
    "2026-05-09T06:00:00.000Z",
    "2026-05-09T09:00:00.000Z",
    "2026-05-09T11:00:00.000Z",
  ];
  const circuitClient = makeFakeCircuit({ recentSends });
  const { handler, resend } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler(authedReq(fullPayload()), res);

  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, "daily_cap");
  assert.equal(resend._calls.broadcastCreates, undefined);
});

test("Yesterday's sends do NOT count toward today's daily cap", async () => {
  const recentSends = [
    "2026-05-08T22:00:00.000Z",
    "2026-05-08T20:00:00.000Z",
    "2026-05-08T15:00:00.000Z",
    "2026-05-08T10:00:00.000Z",
    "2026-05-08T05:00:00.000Z",
  ];
  const circuitClient = makeFakeCircuit({ recentSends });
  const { handler } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler(authedReq(fullPayload()), res);
  assert.equal(res.statusCode, 200);
});

test("Fail-closed when Circuit listCampaigns throws (cost-protection)", async () => {
  const circuitClient = {
    async listCampaigns() {
      throw new Error("upstream 502");
    },
    async createCampaign() {
      throw new Error("should not be called");
    },
  };
  const { handler, resend } = makeHandler({ circuitClient });
  const res = createFakeRes();
  await handler(authedReq(fullPayload()), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "quota_lookup_failed");
  assert.equal(resend._calls.broadcastCreates, undefined);
});

// ─── Happy path + audit + outings ──────────────────────────────────────

test("Happy path: gates clear → Resend send → Circuit audit → outing flip", async () => {
  const db = createFakeFirestore();
  await db.collection("outings").doc("out-1").set({ status: "draft" });
  await db.collection("outings").doc("out-2").set({ status: "draft" });

  const { handler, resend, circuitClient } = makeHandler({ db });
  const res = createFakeRes();

  await handler(
    authedReq({
      ...fullPayload(),
      outingIds: ["out-1", "out-2"],
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.broadcastId, "b_1");
  assert.equal(res.body.circuitCampaignId, "cmp_1");
  assert.equal(res.body.warning, null);
  assert.deepEqual(res.body.quota, {
    hourly: 1,
    hourlyMax: 4,
    daily: 1,
    dailyMax: 5,
  });

  assert.equal(resend._calls.broadcastCreates.length, 1);
  assert.equal(resend._calls.broadcastSends.length, 1);
  assert.equal(circuitClient.calls.length, 1);
  assert.equal(
    circuitClient.calls[0].segmentFilters.resendBroadcastId,
    "b_1",
  );

  const o1 = await db.collection("outings").doc("out-1").get();
  assert.equal(o1.data().status, "broadcast");
});

test("Returns warning when Circuit audit write fails but Resend succeeded", async () => {
  const circuitClient = makeFakeCircuit({ throwOnCreate: "upstream 500" });
  const { handler, resend } = makeHandler({ circuitClient });
  const res = createFakeRes();

  await handler(authedReq(fullPayload()), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.broadcastId, "b_1");
  assert.equal(res.body.circuitCampaignId, null);
  assert.equal(res.body.warning, "circuit_audit_unavailable");
  assert.equal(resend._calls.broadcastSends.length, 1);
});

test("Without outingIds, Firestore outings collection is untouched", async () => {
  const db = createFakeFirestore();
  await db.collection("outings").doc("out-x").set({ status: "draft" });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler(authedReq(fullPayload()), res);

  const ox = await db.collection("outings").doc("out-x").get();
  assert.equal(ox.data().status, "draft");
});
