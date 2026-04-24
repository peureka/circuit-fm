const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/attendance");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

const SECRET = "att-test-secret";

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  return {
    handler: createHandler({
      db,
      adminSecret: SECRET,
      timestamp: () => new Date("2026-05-20T20:00:00Z"),
      ...overrides,
    }),
    db,
  };
}

function authed(method, body, query) {
  return {
    method,
    headers: { authorization: `Bearer ${SECRET}` },
    body: body || {},
    query: query || {},
  };
}

test("POST records an attendance doc and returns 200", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();

  await handler(
    authed("POST", { outing_id: "out-1", email: "Ada@Example.com" }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.recorded, 1);

  const doc = await db
    .collection("attendance")
    .doc("out-1__ada@example.com")
    .get();
  assert.equal(doc.exists, true);
  assert.equal(doc.data().outing_id, "out-1");
  assert.equal(doc.data().email, "ada@example.com");
  assert.ok(doc.data().attended_at);
});

test("POST advances matching vouches from 'tapped' to 'floor'", async () => {
  const db = createFakeFirestore();
  // Seed a vouch pointing to ada@example.com
  await db
    .collection("vouches")
    .doc("voucher-1__ada@example.com")
    .set({
      from_member_id: "voucher-1",
      recipient_email: "ada@example.com",
      status: "tapped",
      created_at: new Date("2026-04-25T00:00:00Z"),
    });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler(
    authed("POST", { outing_id: "out-may-20", email: "ada@example.com" }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.vouches_advanced, 1);

  const vouch = await db
    .collection("vouches")
    .doc("voucher-1__ada@example.com")
    .get();
  assert.equal(vouch.data().status, "floor");
  assert.ok(vouch.data().floor_at);
});

test("POST does NOT advance vouches already at 'floor' or 'voucher'", async () => {
  const db = createFakeFirestore();
  await db
    .collection("vouches")
    .doc("v1__e@x.com")
    .set({
      from_member_id: "v1",
      recipient_email: "e@x.com",
      status: "floor",
    });
  await db
    .collection("vouches")
    .doc("v2__e@x.com")
    .set({
      from_member_id: "v2",
      recipient_email: "e@x.com",
      status: "voucher",
    });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler(
    authed("POST", { outing_id: "out-2", email: "e@x.com" }),
    res,
  );

  assert.equal(res.body.vouches_advanced, 0);

  const v1 = await db.collection("vouches").doc("v1__e@x.com").get();
  const v2 = await db.collection("vouches").doc("v2__e@x.com").get();
  assert.equal(v1.data().status, "floor");
  assert.equal(v2.data().status, "voucher");
});

test("POST recording same attendance twice is idempotent", async () => {
  const { handler, db } = makeHandler();

  await handler(
    authed("POST", { outing_id: "out-3", email: "e@x.com" }),
    createFakeRes(),
  );
  const res2 = createFakeRes();
  await handler(
    authed("POST", { outing_id: "out-3", email: "e@x.com" }),
    res2,
  );

  assert.equal(res2.statusCode, 200);
  const snap = await db.collection("attendance").get();
  assert.equal(snap.docs.length, 1);
});

test("POST with emails array records bulk attendance", async () => {
  const db = createFakeFirestore();
  // Seed vouches for two of the three emails
  await db
    .collection("vouches")
    .doc("v1__a@x.com")
    .set({ from_member_id: "v1", recipient_email: "a@x.com", status: "tapped" });
  await db
    .collection("vouches")
    .doc("v2__b@x.com")
    .set({ from_member_id: "v2", recipient_email: "b@x.com", status: "tapped" });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler(
    authed("POST", {
      outing_id: "big-night",
      emails: ["a@x.com", "b@x.com", "c@x.com"],
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.recorded, 3);
  assert.equal(res.body.vouches_advanced, 2);

  const attendanceSnap = await db.collection("attendance").get();
  assert.equal(attendanceSnap.docs.length, 3);
});

test("POST without auth returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { outing_id: "x", email: "e@x.com" },
      query: {},
    },
    res,
  );
  assert.equal(res.statusCode, 401);
});

test("POST missing outing_id returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(authed("POST", { email: "e@x.com" }), res);
  assert.equal(res.statusCode, 400);
});

test("POST with neither email nor emails returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(authed("POST", { outing_id: "x" }), res);
  assert.equal(res.statusCode, 400);
});

test("POST with invalid email format returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    authed("POST", { outing_id: "x", email: "not-an-email" }),
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("GET ?outing_id returns all attendance for that outing", async () => {
  const db = createFakeFirestore();
  await db.collection("attendance").doc("out-x__a@x.com").set({
    outing_id: "out-x",
    email: "a@x.com",
    attended_at: new Date(),
  });
  await db.collection("attendance").doc("out-x__b@x.com").set({
    outing_id: "out-x",
    email: "b@x.com",
    attended_at: new Date(),
  });
  await db.collection("attendance").doc("out-y__c@x.com").set({
    outing_id: "out-y",
    email: "c@x.com",
    attended_at: new Date(),
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler(authed("GET", null, { outing_id: "out-x" }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.records.length, 2);
  const emails = res.body.records.map((r) => r.email).sort();
  assert.deepEqual(emails, ["a@x.com", "b@x.com"]);
});

test("GET without outing_id returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(authed("GET", null, {}), res);
  assert.equal(res.statusCode, 400);
});

test("DELETE removes an attendance record (for corrections)", async () => {
  const db = createFakeFirestore();
  await db.collection("attendance").doc("o1__e@x.com").set({
    outing_id: "o1",
    email: "e@x.com",
    attended_at: new Date(),
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler(
    authed("DELETE", { outing_id: "o1", email: "e@x.com" }),
    res,
  );

  assert.equal(res.statusCode, 200);
  const doc = await db.collection("attendance").doc("o1__e@x.com").get();
  assert.equal(doc.exists, false);
});
