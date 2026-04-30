const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/release");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  const deps = {
    db,
    timestamp: () => new Date("2026-04-30T00:00:00Z"),
    ...overrides,
  };
  return { handler: createHandler(deps), db };
}

test("POST with valid name + email + consent writes a release doc", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: {
        name: "Ada Lovelace",
        email: "Ada@Example.com",
        consent: true,
        referrer: "https://circuit.fm/release?shoot=day1",
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);

  const doc = await db.collection("releases").doc("ada@example.com").get();
  assert.equal(doc.exists, true);
  assert.equal(doc.data().name, "Ada Lovelace");
  assert.equal(doc.data().email, "ada@example.com");
  assert.equal(doc.data().consent, true);
  assert.equal(doc.data().referrer, "https://circuit.fm/release?shoot=day1");
});

test("POST without referrer still works (referrer is optional)", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { name: "Test", email: "noref@example.com", consent: true },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  const doc = await db.collection("releases").doc("noref@example.com").get();
  assert.equal(doc.data().referrer, undefined);
});

test("POST without consent returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { name: "Test", email: "test@example.com", consent: false },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /consent/i);
});

test("POST with consent=true (string) is rejected — must be boolean true", async () => {
  // Strict boolean check protects against client-side bugs that send "true"
  // as a string and would have the same UX as a checked box.
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { name: "Test", email: "test@example.com", consent: "true" },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST with missing name returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { email: "test@example.com", consent: true },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /name/i);
});

test("POST with whitespace-only name returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { name: "   ", email: "test@example.com", consent: true },
    },
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
      body: { name: "Test", email: "not-an-email", consent: true },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /email/i);
});

test("POST with name longer than 100 chars returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { name: "n".repeat(101), email: "test@example.com", consent: true },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST is idempotent — re-submitting with the same email merges the doc", async () => {
  const { handler, db } = makeHandler();
  const res1 = createFakeRes();
  await handler(
    {
      method: "POST",
      body: {
        name: "Ada",
        email: "ada@example.com",
        consent: true,
        referrer: "https://circuit.fm/release?shoot=day1",
      },
    },
    res1,
  );

  const res2 = createFakeRes();
  await handler(
    {
      method: "POST",
      body: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        consent: true,
        referrer: "https://circuit.fm/release?shoot=day3",
      },
    },
    res2,
  );

  assert.equal(res2.statusCode, 200);
  const doc = await db.collection("releases").doc("ada@example.com").get();
  // Latest submission's name + referrer wins
  assert.equal(doc.data().name, "Ada Lovelace");
  assert.equal(doc.data().referrer, "https://circuit.fm/release?shoot=day3");
});

test("referrer is truncated at 500 chars", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  const longReferrer = "https://circuit.fm/release?" + "x=y&".repeat(200);
  await handler(
    {
      method: "POST",
      body: {
        name: "Test",
        email: "long@example.com",
        consent: true,
        referrer: longReferrer,
      },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  const doc = await db.collection("releases").doc("long@example.com").get();
  assert.equal(doc.data().referrer.length, 500);
});

test("GET returns 405 with Allow: POST", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers["Allow"], "POST");
});

test("email is normalised to lowercase before storage", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { name: "Test", email: "MixedCase@Example.COM", consent: true },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  const doc = await db.collection("releases").doc("mixedcase@example.com").get();
  assert.equal(doc.exists, true);
});
