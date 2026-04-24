const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { createHandler } = require("../api/webhooks/circuit-checkin");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

const SECRET = "circuit-webhook-test-secret";

function sign(body, secret = SECRET) {
  return crypto
    .createHmac("sha256", secret)
    .update(typeof body === "string" ? body : JSON.stringify(body))
    .digest("hex");
}

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  return {
    handler: createHandler({
      db,
      webhookSecret: SECRET,
      timestamp: () => new Date("2026-05-20T20:00:00Z"),
      ...overrides,
    }),
    db,
  };
}

function req({ body, signature, rawBody }) {
  const stringBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    method: "POST",
    headers: {
      "x-circuit-signature": signature ?? sign(stringBody),
      "content-type": "application/json",
    },
    body: typeof body === "string" ? JSON.parse(body) : body,
    rawBody: rawBody ?? stringBody,
  };
}

async function seedOuting(db, outingId, circuitEventId) {
  await db.collection("outings").doc(outingId).set({
    name: "LINECONIC May 20",
    format: "Watch",
    date: "2026-05-20",
    venue: "Soho House — Greek Street",
    circuit_event_id: circuitEventId,
    status: "scheduled",
  });
}

test("POST with valid signature + mapped event records attendance", async () => {
  const db = createFakeFirestore();
  await seedOuting(db, "out-may-20", "circuit-evt-123");
  // Pre-seed a vouch pointing at the attendee
  await db.collection("vouches").doc("voucher-1__ada@example.com").set({
    from_member_id: "voucher-1",
    recipient_email: "ada@example.com",
    status: "tapped",
  });

  const body = {
    event_type: "checkin.created",
    circuit_event_id: "circuit-evt-123",
    guest: { email: "Ada@Example.com", name: "Ada" },
    checked_in_at: "2026-05-20T20:15:00Z",
  };

  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler(req({ body }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.action, "attendance_recorded");
  assert.equal(res.body.outing_id, "out-may-20");
  assert.equal(res.body.vouches_advanced, 1);

  const attendance = await db
    .collection("attendance")
    .doc("out-may-20__ada@example.com")
    .get();
  assert.equal(attendance.exists, true);
  assert.equal(attendance.data().source, "circuit_webhook");

  const vouch = await db
    .collection("vouches")
    .doc("voucher-1__ada@example.com")
    .get();
  assert.equal(vouch.data().status, "floor");
});

test("POST with mapping to unknown circuit_event_id skips cleanly", async () => {
  const { handler } = makeHandler();
  const body = {
    event_type: "checkin.created",
    circuit_event_id: "unmapped-event",
    guest: { email: "a@x.com" },
    checked_in_at: "2026-05-20T20:15:00Z",
  };

  const res = createFakeRes();
  await handler(req({ body }), res);

  // Respond 200 (Circuit retries on 5xx; this is a legitimate non-error skip)
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.action, "skipped_unmapped_event");
});

test("POST with no guest email skips (can't match to Culture Club member)", async () => {
  const db = createFakeFirestore();
  await seedOuting(db, "out-x", "evt-x");

  const body = {
    event_type: "checkin.created",
    circuit_event_id: "evt-x",
    guest: { name: "Walk-in", phone: "+44000000" },
    checked_in_at: "2026-05-20T20:15:00Z",
  };

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(req({ body }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.action, "skipped_no_email");
});

test("POST with invalid signature returns 401", async () => {
  const { handler } = makeHandler();
  const body = { event_type: "checkin.created", circuit_event_id: "e", guest: { email: "e@x.com" } };
  const res = createFakeRes();
  await handler(req({ body, signature: "deadbeef" }), res);
  assert.equal(res.statusCode, 401);
});

test("POST with missing signature returns 401", async () => {
  const { handler } = makeHandler();
  const body = { event_type: "checkin.created" };
  const badReq = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    rawBody: JSON.stringify(body),
  };
  const res = createFakeRes();
  await handler(badReq, res);
  assert.equal(res.statusCode, 401);
});

test("POST with wrong event_type is acknowledged but not acted on", async () => {
  const { handler } = makeHandler();
  const body = {
    event_type: "guest.updated",
    circuit_event_id: "evt-1",
    guest: { email: "e@x.com" },
  };
  const res = createFakeRes();
  await handler(req({ body }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.action, "ignored_event_type");
});

test("POST with missing rawBody (required for signing) returns 400", async () => {
  const { handler } = makeHandler();
  const body = { event_type: "checkin.created" };
  const r = {
    method: "POST",
    headers: { "x-circuit-signature": "anything" },
    body,
    // rawBody missing
  };
  const res = createFakeRes();
  await handler(r, res);
  assert.equal(res.statusCode, 400);
});

test("GET returns 405", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test("POST is idempotent — same check-in replayed doesn't duplicate attendance", async () => {
  const db = createFakeFirestore();
  await seedOuting(db, "out-rep", "evt-rep");

  const body = {
    event_type: "checkin.created",
    circuit_event_id: "evt-rep",
    guest: { email: "x@x.com" },
    checked_in_at: "2026-05-20T20:15:00Z",
  };

  const { handler } = makeHandler({ db });
  await handler(req({ body }), createFakeRes());
  await handler(req({ body }), createFakeRes());

  const snap = await db.collection("attendance").get();
  assert.equal(snap.docs.length, 1);
});
