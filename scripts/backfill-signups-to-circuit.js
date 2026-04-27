#!/usr/bin/env node
// Backfill existing Firestore `signups` into Circuit's Circuit FM audience.
//
// Iterates the signups collection, POSTs each to Circuit's
// /api/organiser/v1/audience/upsert, and writes the resulting profileUrl
// back onto the signups doc so the system is in a consistent state.
//
// Idempotent: Circuit's upsert is idempotent (same email returns the same
// profileToken), and re-running just refreshes profileUrl on each doc.
//
// Required env (read from .env.local on local runs, or set in shell):
//   FIREBASE_SERVICE_ACCOUNT  service account JSON for the cccircuit project
//   CIRCUIT_BASE_URL          e.g. https://meetcircuit.com
//   CIRCUIT_ORGANISER_API_TOKEN  token printed by seed-circuit-fm-organiser.ts
//
// Usage:
//   node scripts/backfill-signups-to-circuit.js
//   node scripts/backfill-signups-to-circuit.js --dry-run
//   node scripts/backfill-signups-to-circuit.js --limit 100
//   node scripts/backfill-signups-to-circuit.js --batch-size 25
//
// Flags:
//   --dry-run        Read everything, call nothing, print what would happen
//   --limit N        Stop after N signups (smoke-test on a slice first)
//   --batch-size N   Concurrency cap on simultaneous Circuit calls (default 10)
//   --skip-completed Skip docs that already have a profileUrl (default: refresh)

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { createCircuitClient } = require("../lib/circuit-client");

function parseArgs(argv) {
  const out = {
    dryRun: false,
    limit: null,
    batchSize: 10,
    skipCompleted: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--skip-completed") out.skipCompleted = true;
    else if (a === "--limit") out.limit = parseInt(argv[++i], 10);
    else if (a === "--batch-size") out.batchSize = parseInt(argv[++i], 10);
    else if (a.startsWith("--limit=")) out.limit = parseInt(a.split("=")[1], 10);
    else if (a.startsWith("--batch-size=")) out.batchSize = parseInt(a.split("=")[1], 10);
  }
  if (Number.isNaN(out.limit)) out.limit = null;
  if (!Number.isFinite(out.batchSize) || out.batchSize < 1) out.batchSize = 10;
  return out;
}

function loadDotEnvLocal() {
  // Only used as a convenience for local runs. CI/Vercel passes envs directly.
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function processBatch(batch, circuit, db, opts, stats) {
  await Promise.all(
    batch.map(async (doc) => {
      const data = doc.data();
      const email = data.email || doc.id;
      const name = data.name || undefined;

      if (opts.skipCompleted && data.profileUrl) {
        stats.skipped++;
        return;
      }

      if (opts.dryRun) {
        stats.wouldUpsert++;
        return;
      }

      try {
        const result = await circuit.upsertAudience({
          email,
          name,
          source: "circuitfm-backfill",
        });
        const profileUrl = result?.profileUrl;
        if (profileUrl) {
          await db
            .collection("signups")
            .doc(doc.id)
            .set({ profileUrl }, { merge: true });
          stats.upserted++;
        } else {
          stats.skippedNoUrl++;
        }
      } catch (err) {
        stats.failed++;
        stats.errors.push({ email, error: err.message });
      }
    })
  );
}

async function main() {
  loadDotEnvLocal();
  const opts = parseArgs(process.argv);

  const baseUrl = process.env.CIRCUIT_BASE_URL;
  const token = process.env.CIRCUIT_ORGANISER_API_TOKEN;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!baseUrl) die("CIRCUIT_BASE_URL is required");
  if (!token) die("CIRCUIT_ORGANISER_API_TOKEN is required");
  if (!sa) die("FIREBASE_SERVICE_ACCOUNT is required");

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
  }
  const db = admin.firestore();
  const circuit = createCircuitClient({ baseUrl, token });

  console.log("Backfill signups → Circuit audience");
  console.log(`  baseUrl:       ${baseUrl}`);
  console.log(`  dryRun:        ${opts.dryRun}`);
  console.log(`  limit:         ${opts.limit ?? "(none)"}`);
  console.log(`  batchSize:     ${opts.batchSize}`);
  console.log(`  skipCompleted: ${opts.skipCompleted}`);
  console.log("");

  const stats = {
    seen: 0,
    upserted: 0,
    wouldUpsert: 0,
    skipped: 0,
    skippedNoUrl: 0,
    failed: 0,
    errors: [],
  };

  let q = db.collection("signups").orderBy("created_at");
  if (opts.limit) q = q.limit(opts.limit);

  const snapshot = await q.get();
  const docs = snapshot.docs;
  console.log(`Loaded ${docs.length} signups.`);

  for (let i = 0; i < docs.length; i += opts.batchSize) {
    const batch = docs.slice(i, i + opts.batchSize);
    stats.seen += batch.length;
    await processBatch(batch, circuit, db, opts, stats);
    process.stdout.write(
      `\r  processed ${stats.seen}/${docs.length} ` +
        `(upserted=${stats.upserted} would=${stats.wouldUpsert} skipped=${stats.skipped} failed=${stats.failed})`
    );
  }
  console.log("");

  console.log("");
  console.log("Done.");
  console.log(`  seen:           ${stats.seen}`);
  if (opts.dryRun) console.log(`  would upsert:   ${stats.wouldUpsert}`);
  else console.log(`  upserted:       ${stats.upserted}`);
  console.log(`  skipped:        ${stats.skipped}`);
  console.log(`  skippedNoUrl:   ${stats.skippedNoUrl}`);
  console.log(`  failed:         ${stats.failed}`);
  if (stats.errors.length > 0) {
    console.log("");
    console.log("First 10 errors:");
    for (const e of stats.errors.slice(0, 10)) {
      console.log(`  ${e.email}: ${e.error}`);
    }
  }
  process.exit(stats.failed > 0 ? 2 : 0);
}

function die(msg) {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}

// Exported for tests. Not part of the script's runtime path.
module.exports = { processBatch };

if (require.main === module) {
  main().catch((err) => {
    console.error("");
    console.error("Backfill failed:");
    console.error(err);
    process.exit(1);
  });
}
