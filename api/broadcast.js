// Send a Culture Club broadcast email and record the campaign.
//
// Email delivery: Resend (broadcasts.create + broadcasts.send against a
// pre-configured Resend segment). Unchanged from the pre-consolidation
// shape — Resend remains the email pipeline.
//
// Audit record: post-consolidation we write the campaign metadata to
// Circuit's Postgres via the organiser API (POST /campaigns) instead of
// Firestore. This puts broadcast history in the same place as cards and
// member identity. The actual recipient set is still resolved by Resend
// via segmentId; Circuit's Campaign row carries name/subject/sentAt for
// visibility on meetcircuit.com.
//
// Outing status update: Culture-Club-specific state, stays in Firestore
// (outings/vouches/leaderboard are not consolidated by this work).
//
// Auth: Bearer BROADCAST_SECRET.

const { Resend } = require("resend");
const admin = require("firebase-admin");
const { renderShortlist, renderWildcard } = require("../lib/templates");
const { createCircuitClient } = require("../lib/circuit-client");

const templates = { shortlist: renderShortlist, wildcard: renderWildcard };

function createHandler({
  circuitClient,
  db,
  adminSecret,
  resend,
  fromAddress,
  segmentId,
}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const auth = req.headers && req.headers.authorization;
    if (!adminSecret || auth !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
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
      return res
        .status(500)
        .json({ error: "Missing RESEND_SEGMENT_ID" });
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

      // Record a Campaign row in Circuit Postgres for audit. Best-effort:
      // if Circuit is unreachable we still treat the send as successful
      // (Resend already accepted it) and surface a warning in the response.
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

      // Outing status — Culture Club state, stays in Firestore.
      // Sequential updates rather than a batch: outingIds are small (1-3
      // typically) and per-doc updates make this trivially testable.
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
      resend: new Resend(resendKey),
      fromAddress: process.env.RESEND_FROM || "Circuit <onboarding@resend.dev>",
      segmentId: process.env.RESEND_SEGMENT_ID,
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
