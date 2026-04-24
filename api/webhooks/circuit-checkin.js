// Webhook receiver: Circuit check-in events -> Culture Club attendance.
//
// When a guest taps the Block at a Culture Club / LINECONIC event, Circuit
// fires a webhook here. We translate that into an attendance record and
// advance any matching vouches from "tapped" to "floor".
//
// Circuit side (to be configured in the circuit admin / env):
//   - Webhook URL: https://www.cccircuit.com/api/webhooks/circuit-checkin
//   - HMAC-SHA256 signature of the raw request body (the EXACT bytes sent)
//     passed in the X-Circuit-Signature header using shared secret
//     CIRCUIT_WEBHOOK_SECRET.
//   - Event types: "checkin.created" (others are acknowledged and ignored).
//   - Mapping: Circuit Event -> Culture Club outing via outing.circuit_event_id.
//     Events without a mapping land here and are skipped with 200 OK
//     (not an error — Circuit keeps dispatching).
//
// Auth: X-Circuit-Signature header, verified against CIRCUIT_WEBHOOK_SECRET.

const admin = require("firebase-admin");
const crypto = require("crypto");

function verifySignature(rawBody, header, secret) {
  if (!header || !rawBody || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  // Constant-time compare
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(header), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function pickEmail(guest) {
  if (!guest || typeof guest !== "object") return null;
  const e = guest.email;
  if (typeof e !== "string" || !e.includes("@")) return null;
  const clean = e.trim().toLowerCase();
  if (clean.length < 6 || clean.length > 100) return null;
  return clean;
}

async function findOutingByCircuitEventId(db, circuitEventId) {
  const snap = await db
    .collection("outings")
    .where("circuit_event_id", "==", circuitEventId)
    .get();
  if (snap.docs.length === 0) return null;
  // If multiple outings point at the same circuit event, take the first
  // — collisions shouldn't happen in practice.
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

async function recordAttendanceAndAdvance({ db, outingId, email, timestamp }) {
  const attId = `${outingId}__${email}`;
  const attRef = db.collection("attendance").doc(attId);
  const existing = await attRef.get();
  if (!existing.exists) {
    await attRef.set({
      outing_id: outingId,
      email,
      attended_at: timestamp(),
      source: "circuit_webhook",
    });
  }

  const tappedSnap = await db
    .collection("vouches")
    .where("recipient_email", "==", email)
    .where("status", "==", "tapped")
    .get();

  let advanced = 0;
  for (const vouchDoc of tappedSnap.docs) {
    await db
      .collection("vouches")
      .doc(vouchDoc.id)
      .set({ status: "floor", floor_at: timestamp() }, { merge: true });
    advanced++;
  }
  return { advanced, attendance_was_new: !existing.exists };
}

function createHandler({ db, webhookSecret, timestamp }) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!req.rawBody || typeof req.rawBody !== "string") {
      return res.status(400).json({
        error:
          "rawBody required for signature verification — ensure the webhook route is deployed with bodyParser giving access to the raw request bytes",
      });
    }

    const signature = req.headers && req.headers["x-circuit-signature"];
    if (!verifySignature(req.rawBody, signature, webhookSecret)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const body = req.body || {};
    const eventType = body.event_type;
    if (eventType !== "checkin.created") {
      return res.status(200).json({
        ok: true,
        action: "ignored_event_type",
        event_type: eventType,
      });
    }

    const circuitEventId = body.circuit_event_id;
    if (!circuitEventId || typeof circuitEventId !== "string") {
      return res.status(400).json({ error: "circuit_event_id required" });
    }

    const email = pickEmail(body.guest);
    if (!email) {
      return res
        .status(200)
        .json({ ok: true, action: "skipped_no_email", circuit_event_id: circuitEventId });
    }

    try {
      const outing = await findOutingByCircuitEventId(db, circuitEventId);
      if (!outing) {
        return res.status(200).json({
          ok: true,
          action: "skipped_unmapped_event",
          circuit_event_id: circuitEventId,
        });
      }

      const result = await recordAttendanceAndAdvance({
        db,
        outingId: outing.id,
        email,
        timestamp,
      });

      return res.status(200).json({
        ok: true,
        action: "attendance_recorded",
        outing_id: outing.id,
        email,
        attendance_was_new: result.attendance_was_new,
        vouches_advanced: result.advanced,
      });
    } catch (err) {
      console.error("Circuit webhook error:", err);
      return res.status(500).json({ error: "Something went wrong" });
    }
  };
}

// Production handler: lazy-init Firebase. Note: Vercel provides `req.body`
// (parsed JSON) but not `rawBody` by default. We read the raw bytes via a
// stream listener before the body parser runs.
let cachedProdHandler = null;

async function readRawBody(req) {
  // If Vercel already read and parsed the body, we can reconstruct; but the
  // HMAC MUST be computed over the exact raw bytes. The robust path is to
  // bypass Vercel's body parser for this route.
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function defaultHandler(req, res) {
  if (!cachedProdHandler) {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    cachedProdHandler = createHandler({
      db: admin.firestore(),
      webhookSecret: process.env.CIRCUIT_WEBHOOK_SECRET,
      timestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return cachedProdHandler(req, res);
}

// Vercel requires this export to disable body parsing so we can read raw bytes.
// The handler wrapper below reads the stream, hashes it, and also parses it.
async function rawBodyHandler(req, res) {
  try {
    const raw = await readRawBody(req);
    req.rawBody = raw;
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  } catch (err) {
    return res.status(400).json({ error: "Failed to read request body" });
  }
  return defaultHandler(req, res);
}

module.exports = rawBodyHandler;
module.exports.config = {
  api: { bodyParser: false },
};
module.exports.createHandler = createHandler;
module.exports.verifySignature = verifySignature;
