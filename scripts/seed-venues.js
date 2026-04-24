#!/usr/bin/env node
// Seed Culture Club venues from scripts/venues-seed.json into production.
//
// Usage:
//   BROADCAST_SECRET=<value> node scripts/seed-venues.js [--base-url=<url>]
//
// Defaults to https://www.cccircuit.com. Pass a different --base-url to run
// against a preview deployment.
//
// Idempotent: api/venues.js POST upserts on a slug derived from venue name,
// so re-running this script updates existing docs rather than duplicating.

const fs = require("fs");
const path = require("path");

const BASE_URL_DEFAULT = "https://www.cccircuit.com";
const SEED_PATH = path.join(__dirname, "venues-seed.json");

function parseArgs(argv) {
  const out = { baseUrl: BASE_URL_DEFAULT };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--base-url=")) out.baseUrl = a.slice("--base-url=".length);
  }
  return out;
}

async function main() {
  const { baseUrl } = parseArgs(process.argv);
  const secret = process.env.BROADCAST_SECRET;
  if (!secret) {
    console.error(
      "FATAL: BROADCAST_SECRET env var required. Export it or rotate via the Vercel dashboard.",
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(SEED_PATH, "utf8");
  const venues = JSON.parse(raw);
  if (!Array.isArray(venues)) {
    console.error("FATAL: venues-seed.json must be a JSON array.");
    process.exit(1);
  }

  console.log(`Seeding ${venues.length} venues to ${baseUrl}/api/venues\n`);

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const v of venues) {
    try {
      const res = await fetch(`${baseUrl}/api/venues`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(v),
      });

      if (!res.ok) {
        failed++;
        const body = await res.text();
        console.error(`  FAIL ${v.name} — ${res.status}: ${body.slice(0, 200)}`);
        continue;
      }

      const data = await res.json();
      // We can't tell create vs update from the response. Count both as
      // "upserted" — any successful 200 is good.
      console.log(`  OK   ${v.name.padEnd(38)} → ${data.id}`);
      updated++;
    } catch (err) {
      failed++;
      console.error(`  FAIL ${v.name} — ${err.message}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(
    `upserted=${updated} failed=${failed} total=${venues.length}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
