// Admin: record who attended a Culture Club outing. Recording attendance
// advances matching vouches from "tapped" to "floor" so the leaderboard
// reflects conversion quality (+3 per converted recipient), not raw handouts.
//
// Auth: Bearer BROADCAST_SECRET.
//
// Data shape:
//   attendance/<outing_id>__<email>  { outing_id, email, attended_at }
//
// Vouch advancement rules:
//   tapped -> floor  : triggered here when a recipient attends their first
//                      (or any) outing. Any vouch pointing at this email
//                      that's still at "tapped" moves to "floor" with a
//                      floor_at timestamp.
//   floor -> voucher : triggered in api/assign-card.js when the recipient
//                      is handed their own card (i.e. they become a voucher
//                      themselves).

const admin = require("firebase-admin");

function isValidEmail(e) {
  return (
    typeof e === "string" &&
    e.length > 5 &&
    e.length <= 100 &&
    e.includes("@")
  );
}

async function advanceVouchesToFloor({ db, email, timestamp }) {
  const snap = await db
    .collection("vouches")
    .where("recipient_email", "==", email)
    .where("status", "==", "tapped")
    .get();

  let advanced = 0;
  for (const vouchDoc of snap.docs) {
    await db
      .collection("vouches")
      .doc(vouchDoc.id)
      .set({ status: "floor", floor_at: timestamp() }, { merge: true });
    advanced++;
  }
  return advanced;
}

function createHandler({ db, adminSecret, timestamp }) {
  return async function handler(req, res) {
    const auth = req.headers && req.headers.authorization;
    if (!adminSecret || auth !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // GET ?outing_id=<id>
    if (req.method === "GET") {
      const outing_id = req.query && req.query.outing_id;
      if (!outing_id || typeof outing_id !== "string") {
        return res.status(400).json({ error: "outing_id query required" });
      }
      const snap = await db
        .collection("attendance")
        .where("outing_id", "==", outing_id)
        .get();
      const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ records, count: records.length });
    }

    // DELETE — correct a mistaken attendance
    if (req.method === "DELETE") {
      const { outing_id, email } = req.body || {};
      if (!outing_id || !email) {
        return res
          .status(400)
          .json({ error: "outing_id and email required" });
      }
      const cleanEmail = String(email).trim().toLowerCase();
      const id = `${outing_id}__${cleanEmail}`;
      await db.collection("attendance").doc(id).delete();
      return res.status(200).json({ ok: true });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body || {};
    const { outing_id, email, emails } = body;

    if (!outing_id || typeof outing_id !== "string") {
      return res.status(400).json({ error: "outing_id required" });
    }

    // Accept either { email } or { emails: [] }. Dedup + normalise.
    const raw = Array.isArray(emails)
      ? emails
      : typeof email === "string"
        ? [email]
        : [];
    if (raw.length === 0) {
      return res
        .status(400)
        .json({ error: "email or emails[] required" });
    }

    const seen = new Set();
    const cleaned = [];
    for (const e of raw) {
      if (!isValidEmail(e)) {
        return res.status(400).json({ error: `invalid email: ${e}` });
      }
      const normalised = e.trim().toLowerCase();
      if (!seen.has(normalised)) {
        seen.add(normalised);
        cleaned.push(normalised);
      }
    }

    let recorded = 0;
    let vouchesAdvanced = 0;

    for (const cleanEmail of cleaned) {
      try {
        const id = `${outing_id}__${cleanEmail}`;
        const ref = db.collection("attendance").doc(id);
        const existing = await ref.get();
        if (!existing.exists) {
          await ref.set({
            outing_id,
            email: cleanEmail,
            attended_at: timestamp(),
          });
        }
        recorded++;

        // Advance any "tapped" vouches to "floor" regardless of whether
        // the attendance was new or a repeat — safe either way since
        // vouches at "floor" or "voucher" are not touched.
        vouchesAdvanced += await advanceVouchesToFloor({
          db,
          email: cleanEmail,
          timestamp,
        });
      } catch (err) {
        console.error(`Attendance for ${cleanEmail} failed:`, err);
      }
    }

    return res.status(200).json({
      recorded,
      vouches_advanced: vouchesAdvanced,
    });
  };
}

// Production handler: lazy-init Firebase.
let cachedProdHandler = null;
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
      adminSecret: process.env.BROADCAST_SECRET,
      timestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
module.exports.advanceVouchesToFloor = advanceVouchesToFloor;
