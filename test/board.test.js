const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/board");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

async function seedVouch(db, { from, email, status }) {
  const id = `${from}__${email}`;
  await db
    .collection("vouches")
    .doc(id)
    .set({
      from_member_id: from,
      recipient_email: email,
      status,
      created_at: new Date("2026-04-24T00:00:00Z"),
    });
}

async function seedMember(db, { id, name }) {
  await db
    .collection("members")
    .doc(id)
    .set({ name, email: `${id}@example.com` });
}

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  return { handler: createHandler({ db, ...overrides }), db };
}

test("GET with empty vouches returns 200 with empty entries array", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "GET", query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.entries, []);
  assert.equal(res.body.count, 0);
});

test("GET ranks members by score descending, resolving member names", async () => {
  const db = createFakeFirestore();
  await seedMember(db, { id: "m1", name: "Ada" });
  await seedMember(db, { id: "m2", name: "Grace" });
  await seedMember(db, { id: "m3", name: "Katherine" });

  await seedVouch(db, { from: "m1", email: "a@x.com", status: "tapped" }); // m1 = 1
  await seedVouch(db, { from: "m2", email: "b@x.com", status: "floor" }); // m2 = 4
  await seedVouch(db, { from: "m2", email: "c@x.com", status: "voucher" }); // m2 = 4 + 14 = 18
  await seedVouch(db, { from: "m3", email: "d@x.com", status: "tapped" }); // m3 = 1
  await seedVouch(db, { from: "m3", email: "e@x.com", status: "tapped" }); // m3 = 2

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler({ method: "GET", query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 3);
  assert.deepEqual(res.body.entries, [
    { name: "Grace", score: 18 },
    { name: "Katherine", score: 2 },
    { name: "Ada", score: 1 },
  ]);
});

test("GET caps at top 50 by default", async () => {
  const db = createFakeFirestore();
  // Seed 55 vouches each from a distinct member
  for (let i = 0; i < 55; i++) {
    const mid = `m${i}`;
    await seedMember(db, { id: mid, name: `Member ${i}` });
    await seedVouch(db, {
      from: mid,
      email: `r${i}@x.com`,
      status: "tapped",
    });
  }

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler({ method: "GET", query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.entries.length, 50);
});

test("Missing member doc falls back to a generic label", async () => {
  const db = createFakeFirestore();
  // vouch from m-ghost but no members/m-ghost doc
  await seedVouch(db, {
    from: "m-ghost",
    email: "r@x.com",
    status: "voucher",
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler({ method: "GET", query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.entries.length, 1);
  assert.match(res.body.entries[0].name, /Culture Club member/);
  assert.equal(res.body.entries[0].score, 14);
});

test("Vouches with unknown status are ignored (score 0, excluded)", async () => {
  const db = createFakeFirestore();
  await seedMember(db, { id: "m1", name: "Ada" });
  await seedVouch(db, { from: "m1", email: "a@x.com", status: "bogus" });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler({ method: "GET", query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.entries, []);
});

test("Response does NOT expose member_id or email (only name + score)", async () => {
  const db = createFakeFirestore();
  await seedMember(db, { id: "sensitive-id-123", name: "Ada" });
  await seedVouch(db, {
    from: "sensitive-id-123",
    email: "secret@example.com",
    status: "tapped",
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler({ method: "GET", query: {} }, res);

  const entry = res.body.entries[0];
  assert.deepEqual(Object.keys(entry).sort(), ["name", "score"]);
  assert.equal(entry.name, "Ada");
});

test("POST returns 405", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "POST" }, res);
  assert.equal(res.statusCode, 405);
});

test("Response includes generated_at timestamp", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "GET", query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.generated_at);
  // Parses as a Date
  assert.ok(!isNaN(new Date(res.body.generated_at).getTime()));
});
