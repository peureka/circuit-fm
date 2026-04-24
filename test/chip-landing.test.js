const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createHandler,
} = require("/Users/roch/Documents/Code/cccircuit/api/c/[chipUid].js");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

async function seed(db, { chipUid, memberId, card, member }) {
  await db
    .collection("cards")
    .doc(chipUid)
    .set({ member_id: memberId, status: "active", ...card });
  if (member) {
    await db.collection("members").doc(memberId).set(member);
  }
}

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  const deps = { db, ...overrides };
  return { handler: createHandler(deps), db };
}

test("GET with a valid active card renders HTML naming the vouching member", async () => {
  const db = createFakeFirestore();
  await seed(db, {
    chipUid: "abc-123",
    memberId: "member-1",
    member: { name: "Ada Lovelace", email: "ada@example.com" },
  });
  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "abc-123" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
  assert.match(res.body, /Ada Lovelace/);
  assert.match(res.body, /thinks you belong in Culture Club/);
  assert.match(res.body, /\/\?v=member-1/);
});

test("GET with unknown chipUid returns 404 HTML", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "nope-nope" } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
});

test("GET with card status 'lost' returns 410", async () => {
  const db = createFakeFirestore();
  await seed(db, {
    chipUid: "lost-card",
    memberId: "member-2",
    card: { status: "lost" },
    member: { name: "Someone", email: "s@example.com" },
  });
  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "lost-card" } }, res);

  assert.equal(res.statusCode, 410);
});

test("GET with card status 'disabled' returns 410", async () => {
  const db = createFakeFirestore();
  await seed(db, {
    chipUid: "disabled-card",
    memberId: "member-3",
    card: { status: "disabled" },
    member: { name: "Former Member", email: "f@example.com" },
  });
  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "disabled-card" } }, res);

  assert.equal(res.statusCode, 410);
});

test("GET with card pointing to missing member returns 500", async () => {
  const db = createFakeFirestore();
  await seed(db, {
    chipUid: "orphan",
    memberId: "ghost-member",
    // No member doc seeded.
  });
  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "orphan" } }, res);

  assert.equal(res.statusCode, 500);
});

test("POST returns 405", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();

  await handler({ method: "POST", query: { chipUid: "abc" } }, res);

  assert.equal(res.statusCode, 405);
});

test("GET with missing chipUid returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();

  await handler({ method: "GET", query: {} }, res);

  assert.equal(res.statusCode, 400);
});

test("member name with HTML-special chars is escaped", async () => {
  const db = createFakeFirestore();
  await seed(db, {
    chipUid: "xss-card",
    memberId: "xss-member",
    member: { name: "<script>alert(1)</script>", email: "e@example.com" },
  });
  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "xss-card" } }, res);

  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, /<script>alert\(1\)<\/script>/);
  assert.match(res.body, /&lt;script&gt;/);
});

test("member without a name falls back to a generic label", async () => {
  const db = createFakeFirestore();
  await seed(db, {
    chipUid: "nameless-card",
    memberId: "nameless-member",
    member: { email: "n@example.com" }, // no name
  });
  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler({ method: "GET", query: { chipUid: "nameless-card" } }, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Culture Club member/);
});
