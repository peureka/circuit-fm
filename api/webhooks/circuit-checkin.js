// Webhook receiver: Circuit attendance.created events → Circuit FM attendance.
//
// Contract matches Circuit's enterprise webhook dispatch (see
// circuit/src/lib/enterprise-webhooks.ts). When a guest taps the Block at a
// Circuit FM event, Circuit POSTs here and we:
//   1. verify the Stripe-style signature (t=<ts>,v1=<hmac over `<ts>.<body>`>)
//   2. resolve the Circuit eventId to a Circuit FM outing via
//      outings.circuit_event_id
//   3. upsert an attendance doc, idempotent by (outing_id, email)
//   4. advance any tapped vouches pointing at this email → floor (+3 score)
//
// Response is always a 200 with an action tag unless the signature is bad
// (401) or the body is malformed (400). Circuit retries only on non-2xx,
// so legitimate skips (unmapped event, no email, wrong event type) are
// acknowledged cleanly without triggering retries.

const admin = require("firebase-admin");
const crypto = require("crypto");

const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

// Parse `t=<ts>,v1=<hex>` (order-insensitive).
function parseSignatureHeader(header) {
  if (typeof header !== "string" || header.length === 0) return null;
  const parts = header.split(",").map((s) => s.trim());
  let ts = null;
  let sig = null;
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === "t" && value.length > 0) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) ts = parsed;
    } else if (key === "v1" && value.length > 0) {
      sig = value;
    }
  }
  if (ts === null || sig === null) return null;
  return { timestamp: ts, signature: sig };
}

function verifySignature({ rawBody, header, secret, nowSeconds }) {
  if (!rawBody || !header || !secret) return false;
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;

  // Replay window: reject stale OR future-skewed timestamps.
  const delta = Math.abs(nowSeconds - parsed.timestamp);
  if (delta > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${rawBody}`)
    .digest("hex");

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(parsed.signature, "hex");
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
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

async function recordAttendanceAndAdvance({
  db,
  outingId,
  email,
  timestamp,
  circuitReturnId,
}) {
  const attId = `${outingId}__${email}`;
  const attRef = db.collection("attendance").doc(attId);
  const existing = await attRef.get();
  if (!existing.exists) {
    const attData = {
      outing_id: outingId,
      email,
      attended_at: timestamp(),
      source: "circuit_webhook",
    };
    if (circuitReturnId) attData.circuit_return_id = circuitReturnId;
    await attRef.set(attData);
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

function createHandler({ db, webhookSecret, timestamp, now }) {
  const nowSecondsFn =
    typeof now === "function"
      ? now
      : () => Math.floor(Date.now() / 1000);

  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!req.rawBody || typeof req.rawBody !== "string") {
      return res.status(400).json({
        error: "rawBody required for signature verification",
      });
    }

    const signatureHeader =
      req.headers && req.headers["x-circuit-signature"];
    if (
      !verifySignature({
        rawBody: req.rawBody,
        header: signatureHeader,
        secret: webhookSecret,
        nowSeconds: nowSecondsFn(),
      })
    ) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const body = req.body || {};
    // Circuit emits `type` in the body (and mirrors in the x-circuit-event-type
    // header). The body field is the source of truth for routing.
    const eventType = body.type;
    if (eventType !== "attendance.created") {
      return res
        .status(200)
        .json({ ok: true, action: "ignored_event_type", event_type: eventType });
    }

    const circuitEventId = body.eventId;
    if (!circuitEventId || typeof circuitEventId !== "string") {
      return res.status(400).json({ error: "eventId required" });
    }

    const email = pickEmail(body.guest);
    if (!email) {
      return res.status(200).json({
        ok: true,
        action: "skipped_no_email",
        event_id: circuitEventId,
      });
    }

    try {
      const outing = await findOutingByCircuitEventId(db, circuitEventId);
      if (!outing) {
        return res.status(200).json({
          ok: true,
          action: "skipped_unmapped_event",
          event_id: circuitEventId,
        });
      }

      const result = await recordAttendanceAndAdvance({
        db,
        outingId: outing.id,
        email,
        timestamp,
        circuitReturnId:
          typeof body.idempotencyKey === "string"
            ? body.idempotencyKey
            : null,
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

// Production handler: lazy-init Firebase, read raw body manually so the
// signature can cover the exact bytes.
let cachedProdHandler = null;

async function readRawBody(req) {
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

async function rawBodyHandler(req, res) {
  try {
    const raw = await readRawBody(req);
    req.rawBody = raw;
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  } catch {
    return res.status(400).json({ error: "Failed to read request body" });
  }
  return defaultHandler(req, res);
}

module.exports = rawBodyHandler;
module.exports.config = {
  api: { bodyParser: false },
};
module.exports.createHandler = createHandler;
module.exports.parseSignatureHeader = parseSignatureHeader;
module.exports.verifySignature = verifySignature;
