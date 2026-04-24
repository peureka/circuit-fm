const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler, slugify } = require("../api/venues");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

const SECRET = "venues-test-secret";

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  return {
    handler: createHandler({
      db,
      adminSecret: SECRET,
      timestamp: () => new Date("2026-04-24T00:00:00Z"),
      ...overrides,
    }),
    db,
  };
}

function authed(method, body) {
  return {
    method,
    headers: { authorization: `Bearer ${SECRET}` },
    body,
  };
}

test("slugify normalises venue names to safe doc IDs", () => {
  assert.equal(slugify("Close-Up Film Centre"), "close-up-film-centre");
  assert.equal(slugify("The Albany"), "the-albany");
  assert.equal(slugify("Peckham Bazaar"), "peckham-bazaar");
  assert.equal(slugify("  White Cube Bermondsey  "), "white-cube-bermondsey");
  assert.equal(slugify("Morley's"), "morley-s");
  assert.equal(slugify("Come Together / Test Kitchen"), "come-together-test-kitchen");
});

test("POST creates a venue at its slug-derived doc ID", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();

  await handler(
    authed("POST", {
      name: "Close-Up Film Centre",
      neighbourhood: "Shoreditch",
      format: "Watch",
      contact: "",
      notes: "anchor",
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, "close-up-film-centre");

  const doc = await db.collection("venues").doc("close-up-film-centre").get();
  assert.equal(doc.exists, true);
  assert.equal(doc.data().name, "Close-Up Film Centre");
  assert.equal(doc.data().neighbourhood, "Shoreditch");
  assert.equal(doc.data().format, "Watch");
});

test("POST with same name upserts (does not duplicate)", async () => {
  const { handler, db } = makeHandler();

  const res1 = createFakeRes();
  await handler(
    authed("POST", { name: "The Albany", neighbourhood: "Deptford", format: "Watch" }),
    res1,
  );

  const res2 = createFakeRes();
  await handler(
    authed("POST", {
      name: "The Albany",
      neighbourhood: "Deptford",
      format: "Watch",
      notes: "Circuit-target: Albany.",
    }),
    res2,
  );

  const snap = await db.collection("venues").get();
  assert.equal(snap.docs.length, 1);
  assert.equal(snap.docs[0].data().notes, "Circuit-target: Albany.");
});

test("POST preserves createdAt on repeat (only writes it the first time)", async () => {
  const { handler, db } = makeHandler({
    timestamp: (() => {
      let n = 0;
      return () => new Date(`2026-04-${(n++ % 2) + 1}T00:00:00Z`);
    })(),
  });

  await handler(
    authed("POST", { name: "Peckham Bazaar", neighbourhood: "Peckham", format: "Eat" }),
    createFakeRes(),
  );

  const first = await db.collection("venues").doc("peckham-bazaar").get();
  const firstCreatedAt = first.data().createdAt;

  await handler(
    authed("POST", {
      name: "Peckham Bazaar",
      neighbourhood: "Peckham",
      format: "Eat",
      notes: "update",
    }),
    createFakeRes(),
  );

  const second = await db.collection("venues").doc("peckham-bazaar").get();
  // createdAt should match the FIRST write's timestamp, even though the
  // timestamp factory has advanced.
  assert.deepEqual(second.data().createdAt, firstCreatedAt);
  assert.equal(second.data().notes, "update");
});

test("POST without auth returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    { method: "POST", body: { name: "X" } },
    res,
  );
  assert.equal(res.statusCode, 401);
});

test("POST with no name returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(authed("POST", { neighbourhood: "Peckham" }), res);
  assert.equal(res.statusCode, 400);
});

test("GET returns venues ordered by name", async () => {
  const db = createFakeFirestore();
  const { handler } = makeHandler({ db });

  // Seed via handler to get realistic shape
  await handler(authed("POST", { name: "Whitechapel Gallery", format: "See" }), createFakeRes());
  await handler(authed("POST", { name: "Close-Up Film Centre", format: "Watch" }), createFakeRes());

  const res = createFakeRes();
  await handler(authed("GET", {}), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.venues.length, 2);
  // Both present, IDs are slugs
  const ids = res.body.venues.map((v) => v.id).sort();
  assert.deepEqual(ids, ["close-up-film-centre", "whitechapel-gallery"]);
});

test("DELETE removes a venue by id", async () => {
  const { handler, db } = makeHandler();
  await handler(authed("POST", { name: "Temp Venue", format: "See" }), createFakeRes());

  const res = createFakeRes();
  await handler(authed("DELETE", { id: "temp-venue" }), res);
  assert.equal(res.statusCode, 200);

  const doc = await db.collection("venues").doc("temp-venue").get();
  assert.equal(doc.exists, false);
});

test("PUT updates a venue by id", async () => {
  const { handler, db } = makeHandler();
  await handler(
    authed("POST", { name: "Rich Mix", neighbourhood: "Shoreditch", format: "Watch" }),
    createFakeRes(),
  );

  const res = createFakeRes();
  await handler(
    authed("PUT", { id: "rich-mix", notes: "updated via PUT" }),
    res,
  );
  assert.equal(res.statusCode, 200);

  const doc = await db.collection("venues").doc("rich-mix").get();
  assert.equal(doc.data().notes, "updated via PUT");
  // Existing fields preserved
  assert.equal(doc.data().neighbourhood, "Shoreditch");
});
