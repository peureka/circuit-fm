// Admin: pre-register a batch of chipUids as Circuit card reservations.
// Run once after programming a fresh batch of NFC cards with NFC Tools so
// the admin panel knows the cards exist and can show them as stock.
//
// Post-consolidation: writes go to Circuit's Postgres via the organiser API
// (POST /api/organiser/v1/cards/reserve). Idempotent at the chip level — a
// chipUid that already has a reservation in Postgres returns 409 from
// Circuit and is reported as "skipped" here.
//
// Auth: Bearer BROADCAST_SECRET (cccircuit admin gate, not the Circuit API
// token — that lives in the env and is consumed by circuitClient).

const { createCircuitClient } = require("../lib/circuit-client");

function createHandler({ circuitClient, adminSecret }) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const auth = req.headers && req.headers.authorization;
    if (!adminSecret || auth !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};
    const { chipUids } = body;

    if (!Array.isArray(chipUids) || chipUids.length === 0) {
      return res
        .status(400)
        .json({ error: "chipUids must be a non-empty array" });
    }

    // Trim, drop empties, dedup. Preserve order for predictable output.
    const seen = new Set();
    const cleaned = [];
    for (const raw of chipUids) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (trimmed.length === 0 || trimmed.length > 128) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      cleaned.push(trimmed);
    }

    if (cleaned.length === 0) {
      return res.status(400).json({ error: "no valid chipUids provided" });
    }

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const chipUid of cleaned) {
      try {
        await circuitClient.reserveCard({ chipUid });
        created++;
      } catch (err) {
        // Circuit returns 409 with "[CONFLICT]" prefix in the error message
        // when the chipUid already has a reservation; treat as skip.
        if (err.message && err.message.includes("CONFLICT")) {
          skipped++;
          continue;
        }
        console.error(`Provision ${chipUid} failed:`, err);
        errors.push({ chipUid, error: err.message });
      }
    }

    return res.status(200).json({
      created,
      skipped,
      failed: errors.length,
      errors: errors.length ? errors : undefined,
    });
  };
}

// Production handler: lazy-init the Circuit client.
let cachedProdHandler = null;
function defaultHandler(req, res) {
  if (!cachedProdHandler) {
    cachedProdHandler = createHandler({
      circuitClient: createCircuitClient({
        baseUrl: process.env.CIRCUIT_API_BASE_URL,
        token: process.env.CIRCUIT_API_TOKEN,
      }),
      adminSecret: process.env.BROADCAST_SECRET,
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
