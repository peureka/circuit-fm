// Admin: assign a printed NFC card to a Culture Club member at first handover.
// This is the "Floor moment" — the curator has a physical card in hand and a
// member in front of them. Called from admin.html.
//
// Creates (or updates) three Firestore docs atomically-ish:
//   - cards/<chipUid>     { member_id, status: "active", issued_at }
//   - members/<memberId>  { email, name, card_issued_at }
//   - signups/<email>     merged with { member_id } backreference
//
// Auth: Bearer BROADCAST_SECRET, same pattern as the other admin endpoints.

const admin = require("firebase-admin");
const crypto = require("crypto");

const MAX_EMAIL_LEN = 100;
const MAX_NAME_LEN = 100;
const MAX_CHIP_UID_LEN = 128;

function createHandler({ db, adminSecret, timestamp, generateId }) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const auth = req.headers && req.headers.authorization;
    if (!adminSecret || auth !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};
    const { chipUid, email, name } = body;

    if (
      !chipUid ||
      typeof chipUid !== "string" ||
      chipUid.trim().length === 0 ||
      chipUid.length > MAX_CHIP_UID_LEN
    ) {
      return res.status(400).json({ error: "Invalid chipUid" });
    }

    if (
      !email ||
      typeof email !== "string" ||
      !email.includes("@") ||
      email.length > MAX_EMAIL_LEN
    ) {
      return res.status(400).json({ error: "Invalid email" });
    }

    if (
      name !== undefined &&
      (typeof name !== "string" ||
        name.trim().length === 0 ||
        name.length > MAX_NAME_LEN)
    ) {
      return res.status(400).json({ error: "Invalid name" });
    }

    const cleanChip = chipUid.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = typeof name === "string" ? name.trim() : null;

    try {
      // Check if the chip is already assigned to a different member.
      const cardRef = db.collection("cards").doc(cleanChip);
      const cardSnap = await cardRef.get();
      if (cardSnap.exists && cardSnap.data().member_id) {
        return res.status(409).json({
          error: "Card already assigned",
          existing_member_id: cardSnap.data().member_id,
        });
      }

      // Check if this email already has a member (= already has a card).
      const signupRef = db.collection("signups").doc(cleanEmail);
      const signupSnap = await signupRef.get();
      if (signupSnap.exists && signupSnap.data().member_id) {
        return res.status(409).json({
          error: "Email already has a card",
          existing_member_id: signupSnap.data().member_id,
        });
      }

      // Resolve the member name: request > existing signup > error.
      const resolvedName =
        cleanName ||
        (signupSnap.exists && typeof signupSnap.data().name === "string"
          ? signupSnap.data().name.trim()
          : null);
      if (!resolvedName) {
        return res.status(400).json({
          error: "Name required (no signup on file with a name)",
        });
      }

      const memberId = generateId();
      const now = timestamp();

      // Member doc — the canonical record for a Floor+ member.
      await db
        .collection("members")
        .doc(memberId)
        .set({
          member_id: memberId,
          email: cleanEmail,
          name: resolvedName,
          card_issued_at: now,
        });

      // Upsert signup with member_id backreference.
      const signupData = {
        email: cleanEmail,
        name: resolvedName,
        member_id: memberId,
      };
      if (!signupSnap.exists) signupData.created_at = now;
      await signupRef.set(signupData, { merge: true });

      // Card doc.
      const cardData = {
        member_id: memberId,
        status: "active",
        issued_at: now,
      };
      if (!cardSnap.exists) cardData.created_at = now;
      await cardRef.set(cardData, { merge: true });

      // Vouch status advancement. This person is now a Floor+-tier
      // member with their own card — i.e. they've become a voucher.
      // Any vouch pointing at this email at "tapped" or "floor" advances
      // to "voucher", scoring the voucher the full +14 cumulative. Idempotent:
      // vouches already at "voucher" stay untouched.
      const tappedSnap = await db
        .collection("vouches")
        .where("recipient_email", "==", cleanEmail)
        .where("status", "==", "tapped")
        .get();
      const floorSnap = await db
        .collection("vouches")
        .where("recipient_email", "==", cleanEmail)
        .where("status", "==", "floor")
        .get();

      let vouchesAdvanced = 0;
      for (const vouchDoc of [...tappedSnap.docs, ...floorSnap.docs]) {
        await db
          .collection("vouches")
          .doc(vouchDoc.id)
          .set({ status: "voucher", voucher_at: now }, { merge: true });
        vouchesAdvanced++;
      }

      return res.status(200).json({
        chipUid: cleanChip,
        member_id: memberId,
        email: cleanEmail,
        vouches_advanced: vouchesAdvanced,
      });
    } catch (err) {
      console.error("Assign card error:", err);
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
      adminSecret: process.env.BROADCAST_SECRET,
      timestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      generateId: () => crypto.randomUUID(),
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
