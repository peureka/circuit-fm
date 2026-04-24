const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/vouch");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  const deps = {
    db,
    timestamp: () => new Date("2026-04-24T00:00:00Z"),
    ...overrides,
  };
  return { handler: createHandler(deps), db };
}

test("POST with voucher_id + email creates a vouches doc with status 'tapped'", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();

  await handler(
    {
      method: "POST",
      body: { voucher_id: "member-ada", email: "friend@example.com" },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.created, true);

  const doc = await db
    .collection("vouches")
    .doc("member-ada__friend@example.com")
    .get();
  assert.equal(doc.exists, true);
  const v = doc.data();
  assert.equal(v.from_member_id, "member-ada");
  assert.equal(v.recipient_email, "friend@example.com");
  assert.equal(v.status, "tapped");
  assert.ok(v.created_at);
});

test("POST missing voucher_id returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    { method: "POST", body: { email: "friend@example.com" } },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST missing email returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    { method: "POST", body: { voucher_id: "member-1" } },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST with invalid email returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { voucher_id: "member-1", email: "not-an-email" },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST with non-string voucher_id returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { voucher_id: 123, email: "friend@example.com" },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST with empty-string voucher_id returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { voucher_id: "", email: "friend@example.com" },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("GET returns 405", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
});

test("Duplicate vouch (same voucher + recipient) is idempotent — one doc, created=false on repeat", async () => {
  const { handler, db } = makeHandler();

  const res1 = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { voucher_id: "m1", email: "dup@example.com" },
    },
    res1,
  );
  assert.equal(res1.body.created, true);

  const res2 = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { voucher_id: "m1", email: "dup@example.com" },
    },
    res2,
  );
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.created, false);

  const snap = await db.collection("vouches").get();
  assert.equal(snap.docs.length, 1);
});

test("Email is normalised to lowercase in the vouch doc ID", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { voucher_id: "mk1", email: "MixedCase@Example.com" },
    },
    res,
  );

  const doc = await db
    .collection("vouches")
    .doc("mk1__mixedcase@example.com")
    .get();
  assert.equal(doc.exists, true);
});

test("voucher_id is trimmed before use", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { voucher_id: "  m-trim  ", email: "e@example.com" },
    },
    res,
  );
  const doc = await db.collection("vouches").doc("m-trim__e@example.com").get();
  assert.equal(doc.exists, true);
});

// ---- hardening: input length limits (session 5) ----

test("POST with voucher_id longer than 128 chars returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { voucher_id: "x".repeat(129), email: "e@example.com" },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST with email longer than 100 chars returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { voucher_id: "m1", email: "a".repeat(96) + "@x.co" }, // 101 chars
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});
