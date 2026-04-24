// Vouch attribution endpoint. Called by the client on signup when the user
// arrived via a card tap (?v=<memberId> in the URL). Writes a `vouches` doc
// attributing the signup to the voucher. Idempotent — deterministic doc ID
// means repeat calls from the same voucher for the same recipient don't
// create duplicate rows or reset created_at.
//
// Separate from /api/signup so each endpoint has one job. Client calls both
// in parallel; signup is primary (the user's on the list either way),
// vouch is best-effort attribution.

const admin = require("firebase-admin");

function createHandler({ db, timestamp }) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body || {};
    const { voucher_id, email } = body;

    if (typeof voucher_id !== "string" || voucher_id.trim().length === 0) {
      return res.status(400).json({ error: "Invalid voucher_id" });
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const cleanVoucher = voucher_id.trim();
    const cleanEmail = email.trim().toLowerCase();
    const vouchId = `${cleanVoucher}__${cleanEmail}`;

    try {
      const vouchRef = db.collection("vouches").doc(vouchId);
      const existing = await vouchRef.get();

      if (existing.exists) {
        return res.status(200).json({ ok: true, created: false });
      }

      await vouchRef.set({
        from_member_id: cleanVoucher,
        recipient_email: cleanEmail,
        status: "tapped",
        created_at: timestamp(),
      });

      return res.status(200).json({ ok: true, created: true });
    } catch (err) {
      console.error("Vouch error:", err);
      return res.status(500).json({ error: "Something went wrong" });
    }
  };
}

// Production handler: lazy-init Firebase so require-time works in tests.
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
      timestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
