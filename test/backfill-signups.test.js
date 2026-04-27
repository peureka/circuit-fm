const test = require("node:test");
const assert = require("node:assert/strict");

const { processBatch } = require("../scripts/backfill-signups-to-circuit");
const { createFakeFirestore } = require("./helpers/fakeFirestore");

function fakeCircuit({ mode = "ok" } = {}) {
  const calls = [];
  return {
    async upsertAudience(args) {
      calls.push(args);
      if (mode === "fail-once" && calls.length === 1) {
        throw new Error("transient");
      }
      if (mode === "fail-all") {
        throw new Error("circuit down");
      }
      return {
        guestId: "g-" + calls.length,
        profileToken: "tok-" + calls.length,
        profileUrl: "https://meetcircuit.com/u/tok-" + calls.length,
      };
    },
    _calls: calls,
  };
}

async function seedSignups(db, signups) {
  for (const s of signups) {
    await db.collection("signups").doc(s.email).set(s);
  }
  const snap = await db.collection("signups").get();
  return snap.docs;
}

function newStats() {
  return {
    seen: 0,
    upserted: 0,
    wouldUpsert: 0,
    skipped: 0,
    skippedNoUrl: 0,
    failed: 0,
    errors: [],
  };
}

test("processBatch upserts each doc and writes profileUrl back to Firestore", async () => {
  const db = createFakeFirestore();
  const docs = await seedSignups(db, [
    { email: "a@x.com", name: "A" },
    { email: "b@x.com", name: "B" },
  ]);
  const circuit = fakeCircuit();
  const stats = newStats();
  await processBatch(docs, circuit, db, { dryRun: false, skipCompleted: false }, stats);

  assert.equal(stats.upserted, 2);
  assert.equal(stats.failed, 0);

  const a = await db.collection("signups").doc("a@x.com").get();
  assert.match(a.data().profileUrl, /^https:\/\/meetcircuit\.com\/u\/tok-/);
});

test("processBatch in dry-run does not call circuit and does not write", async () => {
  const db = createFakeFirestore();
  const docs = await seedSignups(db, [{ email: "a@x.com", name: "A" }]);
  const circuit = fakeCircuit();
  const stats = newStats();
  await processBatch(docs, circuit, db, { dryRun: true, skipCompleted: false }, stats);

  assert.equal(stats.wouldUpsert, 1);
  assert.equal(stats.upserted, 0);
  assert.equal(circuit._calls.length, 0);

  const a = await db.collection("signups").doc("a@x.com").get();
  assert.equal(a.data().profileUrl, undefined);
});

test("processBatch with skipCompleted skips docs that already have profileUrl", async () => {
  const db = createFakeFirestore();
  const docs = await seedSignups(db, [
    { email: "old@x.com", name: "Old", profileUrl: "https://meetcircuit.com/u/already" },
    { email: "new@x.com", name: "New" },
  ]);
  const circuit = fakeCircuit();
  const stats = newStats();
  await processBatch(docs, circuit, db, { dryRun: false, skipCompleted: true }, stats);

  assert.equal(stats.skipped, 1);
  assert.equal(stats.upserted, 1);
  assert.equal(circuit._calls.length, 1);
  assert.equal(circuit._calls[0].email, "new@x.com");
});

test("processBatch records failures without aborting the batch", async () => {
  const db = createFakeFirestore();
  const docs = await seedSignups(db, [
    { email: "a@x.com", name: "A" },
    { email: "b@x.com", name: "B" },
  ]);
  const circuit = fakeCircuit({ mode: "fail-once" });
  const stats = newStats();
  await processBatch(docs, circuit, db, { dryRun: false, skipCompleted: false }, stats);

  assert.equal(stats.failed, 1);
  assert.equal(stats.upserted, 1);
  assert.equal(stats.errors.length, 1);
  assert.match(stats.errors[0].error, /transient/);
});
