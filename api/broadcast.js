// Send a Culture Club broadcast email and record the campaign.
//
// Email delivery: Resend (broadcasts.create + broadcasts.send against a
// pre-configured Resend segment). Resend remains the email pipeline.
//
// Cost-protection (added 2026-05-09):
//   1. Two-key send. The send path requires BOTH BROADCAST_SECRET (Bearer
//      header — same as before, gates admin tooling) AND
//      BROADCAST_CONFIRM_TOKEN (X-Broadcast-Confirm header — separate
//      secret PJ keeps physically distinct). Either alone is rejected.
//   2. Rate limit: max BROADCAST_MAX_PER_HOUR sends per rolling 1h window
//      (default 4). Counted via Circuit's listCampaigns scoped to the
//      Culture Club organiser.
//   3. Daily cap: max BROADCAST_MAX_PER_DAY sends per UTC day (default 5).
//      Same counting source.
//
// Audit record: writes the campaign metadata to Circuit Postgres via
// the organiser API (POST /campaigns) with the Resend broadcast id as
// back-reference.
//
// Outing status update: Culture-Club-specific state, stays in Firestore.

const { Resend } = require("resend");
const admin = require("firebase-admin");
const { renderShortlist, renderWildcard } = require("../lib/templates");
const { createCircuitClient } = require("../lib/circuit-client");

const templates = { shortlist: renderShortlist, wildcard: renderWildcard };

// Hourly + daily counters resolve recent campaigns from Circuit. Pull just
// enough rows to comfortably cover both windows; daily cap is the larger
// bound, so 50 rows is safely beyond a sane daily ceiling.
const COUNT_LOOKBACK_LIMIT = 50;

function countWithinWindow(items, sinceMs, now) {
  let n = 0;
  for (const item of items) {
    const t = item.sentAt ? new Date(item.sentAt).getTime() : null;
    if (t !== null && now - t <= sinceMs) n++;
  }
  return n;
}

function countOnUtcDay(items, dateUtc) {
  const day = dateUtc.toISOString().slice(0, 10);
  let n = 0;
  for (const item of items) {
    if (!item.sentAt) continue;
    if (item.sentAt.slice(0, 10) === day) n++;
  }
  return n;
}

function createHandler({
  circuitClient,
  db,
  adminSecret,
  confirmToken,
  resend,
  fromAddress,
  segmentId,
  maxPerHour,
  maxPerDay,
  now: nowFn,
}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const auth = req.headers && req.headers.authorization;
    if (!adminSecret || auth !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Two-key send: separate confirm token in a distinct header. Even if
    // BROADCAST_SECRET leaks (admin.html access), an attacker cannot
    // dispatch without also having BROADCAST_CONFIRM_TOKEN. Set them to
    // different values; the handler refuses to start if they're equal.
    if (!confirmToken) {
      return res
        .status(500)
        .json({ error: "Missing BROADCAST_CONFIRM_TOKEN" });
    }
    if (confirmToken === adminSecret) {
      return res.status(500).json({
        error:
          "BROADCAST_CONFIRM_TOKEN must be distinct from BROADCAST_SECRET",
      });
    }
    const confirm =
      req.headers && (req.headers["x-broadcast-confirm"] ||
        req.headers["X-Broadcast-Confirm"]);
    if (confirm !== confirmToken) {
      return res
        .status(401)
        .json({ error: "Missing or invalid X-Broadcast-Confirm header" });
    }

    const { template, subject, data, outingIds } = req.body || {};
    if (!template || !subject || !data) {
      return res
        .status(400)
        .json({ error: "Missing template, subject, or data" });
    }

    const renderFn = templates[template];
    if (!renderFn) {
      return res.status(400).json({ error: `Unknown template: ${template}` });
    }

    if (!segmentId) {
      return res.status(500).json({ error: "Missing RESEND_SEGMENT_ID" });
    }

    // Rate limit + daily cap. Count sent campaigns from Circuit. Failure
    // here is fail-CLOSED — if we can't count, we don't send (the cost-
    // protection is the whole point of this gate).
    const now = (nowFn ? nowFn() : new Date());
    let recent;
    try {
      recent = await circuitClient.listCampaigns({
        limit: COUNT_LOOKBACK_LIMIT,
      });
    } catch (err) {
      console.error("Broadcast quota lookup failed:", err);
      return res.status(503).json({
        error: "quota_lookup_failed",
        detail: "Cannot verify rate limit; refusing to send",
      });
    }
    const items = (recent && recent.items) || [];
    const hourly = countWithinWindow(items, 60 * 60 * 1000, now.getTime());
    const daily = countOnUtcDay(items, now);
    if (hourly >= maxPerHour) {
      return res.status(429).json({
        error: "rate_limited",
        detail: `${hourly}/${maxPerHour} sends in the last hour`,
        retryAfterSeconds: 3600,
      });
    }
    if (daily >= maxPerDay) {
      return res.status(429).json({
        error: "daily_cap",
        detail: `${daily}/${maxPerDay} sends today (UTC)`,
        retryAfterSeconds: 86400,
      });
    }

    try {
      const html = renderFn(data);

      const created = await resend.broadcasts.create({
        segmentId,
        from: fromAddress,
        subject,
        html,
        name: `${template}: ${subject}`,
      });
      const broadcastId = created && created.data && created.data.id;

      await resend.broadcasts.send(broadcastId);

      // Best-effort audit row.
      let circuitCampaignId = null;
      let circuitWarning = null;
      try {
        const campaign = await circuitClient.createCampaign({
          name: `${template}: ${subject}`,
          subject,
          bodyText: html,
          segmentFilters: {
            source: "circuitfm-resend",
            resendSegmentId: segmentId,
            resendBroadcastId: broadcastId,
            template,
            outingIds: outingIds || [],
          },
        });
        circuitCampaignId = campaign && campaign.id;
      } catch (err) {
        console.error("Circuit campaign audit write failed:", err);
        circuitWarning = "circuit_audit_unavailable";
      }

      // Outing status — Culture Club state, stays in Firestore. Sequential
      // updates rather than a batch (small N, trivially testable).
      if (outingIds && outingIds.length > 0) {
        for (const oid of outingIds) {
          await db
            .collection("outings")
            .doc(oid)
            .update({ status: "broadcast" });
        }
      }

      return res.status(200).json({
        ok: true,
        broadcastId,
        circuitCampaignId,
        warning: circuitWarning,
        quota: {
          hourly: hourly + 1,
          hourlyMax: maxPerHour,
          daily: daily + 1,
          dailyMax: maxPerDay,
        },
      });
    } catch (err) {
      console.error("Broadcast error:", err);
      return res.status(500).json({ error: "Broadcast failed" });
    }
  };
}

let cachedProdHandler = null;
function defaultHandler(req, res) {
  if (!cachedProdHandler) {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.status(500).json({ error: "Missing RESEND_API_KEY" });
    }
    cachedProdHandler = createHandler({
      circuitClient: createCircuitClient({
        baseUrl: process.env.CIRCUIT_API_BASE_URL,
        token: process.env.CIRCUIT_API_TOKEN,
      }),
      db: admin.firestore(),
      adminSecret: process.env.BROADCAST_SECRET,
      confirmToken: process.env.BROADCAST_CONFIRM_TOKEN,
      resend: new Resend(resendKey),
      fromAddress: process.env.RESEND_FROM || "Circuit <onboarding@resend.dev>",
      segmentId: process.env.RESEND_SEGMENT_ID,
      maxPerHour: Number(process.env.BROADCAST_MAX_PER_HOUR) || 4,
      maxPerDay: Number(process.env.BROADCAST_MAX_PER_DAY) || 5,
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
