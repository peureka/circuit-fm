const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/cards");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

const SECRET = "cards-test-secret";

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  return {
    handler: createHandler({
      db,
      adminSecret: SECRET,
      ...overrides,
    }),
    db,
  };
}

function authed(method) {
  return {
    method,
    headers: { authorization: `Bearer ${SECRET}` },
  };
}

test("GET returns empty list when there are no cards", async () => {
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

test("GET returns all cards with counts grouped by status", async () => {
  const db = createFakeFirestore();
  await db.collection("cards").doc("u1").set({ status: "unassigned" });
  await db.collection("cards").doc("u2").set({ status: "unassigned" });
  await db.collection("cards").doc("a1").set({
    status: "active",
    member_id: "m1",
  });
  await db.collection("cards").doc("l1").set({
    status: "lost",
    member_id: "m2",
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(authed("GET"), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.counts.total, 4);
  assert.equal(res.body.counts.unassigned, 2);
  assert.equal(res.body.counts.active, 1);
  assert.equal(res.body.counts.lost, 1);
  assert.equal(res.body.counts.disabled, 0);
  assert.equal(res.body.cards.length, 4);
});

test("GET resolves member_name for active cards", async () => {
  const db = createFakeFirestore();
  await db.collection("members").doc("m1").set({ name: "Ada Lovelace", email: "ada@example.com" });
  await db.collection("cards").doc("chip-a").set({
    status: "active",
    member_id: "m1",
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(authed("GET"), res);

  const activeCard = res.body.cards.find((c) => c.chipUid === "chip-a");
  assert.equal(activeCard.member_name, "Ada Lovelace");
});

test("GET falls back to generic label when active card's member doc is missing", async () => {
  const db = createFakeFirestore();
  await db.collection("cards").doc("orphan").set({
    status: "active",
    member_id: "ghost",
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(authed("GET"), res);

  const card = res.body.cards.find((c) => c.chipUid === "orphan");
  assert.match(card.member_name, /Circuit FM member/);
});

test("GET unassigned cards have no member_name field or null", async () => {
  const db = createFakeFirestore();
  await db.collection("cards").doc("u1").set({ status: "unassigned" });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(authed("GET"), res);

  const card = res.body.cards.find((c) => c.chipUid === "u1");
  assert.equal(card.member_name, null);
});

test("GET response ordering: unassigned first, then active, then lost/disabled", async () => {
  const db = createFakeFirestore();
  await db.collection("cards").doc("z-active").set({
    status: "active",
    member_id: "m1",
  });
  await db.collection("cards").doc("a-unassigned").set({ status: "unassigned" });
  await db.collection("cards").doc("l-lost").set({ status: "lost", member_id: "m2" });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();
  await handler(authed("GET"), res);

  const statuses = res.body.cards.map((c) => c.status);
  // unassigned before active before lost
  assert.equal(statuses[0], "unassigned");
  assert.equal(statuses[1], "active");
  assert.equal(statuses[2], "lost");
});

test("GET without auth returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 401);
});

test("POST returns 405", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(authed("POST"), res);
  assert.equal(res.statusCode, 405);
});
