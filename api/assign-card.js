// Admin: assign a printed NFC card to a Circuit FM member at first handover.
// The "Floor moment" — the curator has a physical card in hand and a member
// in front of them. Called from admin.html.
//
// Post-consolidation:
//   1. Card binding (chip → member identity) is written to Circuit's
//      Postgres via the organiser API (POST /cards/by-chip/{chipUid}/assign).
//   2. Vouches advancement (Culture-Club-specific social-game state) stays
//      in Firestore — Circuit doesn't model vouches.
//   3. The signups doc gets the Circuit memberCode as a back-reference so
//      future flows can correlate without a Postgres lookup.
//
// Auth: Bearer BROADCAST_SECRET (cccircuit admin gate).

const admin = require("firebase-admin");
const { createCircuitClient } = require("../lib/circuit-client");

const MAX_EMAIL_LEN = 100;
const MAX_NAME_LEN = 100;
const MAX_CHIP_UID_LEN = 128;

function createHandler({ circuitClient, db, adminSecret, timestamp }) {
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

    // Resolve the display name from the request OR the existing signup doc
    // (Ciara often re-uses a name captured at signup time).
    const signupRef = db.collection("signups").doc(cleanEmail);
    const signupSnap = await signupRef.get();
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

    let assignment;
    try {
      assignment = await circuitClient.assignCardByChip({
        chipUid: cleanChip,
        email: cleanEmail,
        displayName: resolvedName,
      });
    } catch (err) {
      // Circuit returns 404 for unknown chip / wrong-tenant chip; 409 for
      // already-claimed-by-different-email or voided card. Surface both
      // as 4xx without leaking which.
      const msg = err.message || "";
      if (msg.includes("CONFLICT")) {
        return res.status(409).json({
          error: "Card already assigned or voided",
        });
      }
      if (msg.includes("NOT_FOUND")) {
        return res.status(404).json({
          error: "Card not found (chip not provisioned in Circuit)",
        });
      }
      console.error("Assign card error:", err);
      return res.status(500).json({ error: "Something went wrong" });
    }

    const now = timestamp();

    // Upsert signup with Circuit member back-reference. The member_id field
    // now holds Circuit's GlobalProfile id (was a Firestore-generated UUID
    // pre-consolidation). Existing rows with the old shape stay untouched
    // unless re-assigned.
    const signupData = {
      email: cleanEmail,
      name: resolvedName,
      member_id: assignment.claim.globalProfileId,
      circuit_member_code: assignment.memberCode,
    };
    if (!signupSnap.exists) signupData.created_at = now;
    await signupRef.set(signupData, { merge: true });

    // Vouches advancement — Culture Club social-game state, stays in
    // Firestore. Any vouch pointing at this email at "tapped" or "floor"
    // advances to "voucher" (the +14 cumulative scoring trigger).
    // Idempotent: vouches already at "voucher" stay untouched.
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
      member_id: assignment.claim.globalProfileId,
      circuit_member_code: assignment.memberCode,
      email: cleanEmail,
      vouches_advanced: vouchesAdvanced,
      created: assignment.created,
    });
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
    cachedProdHandler = createHandler({
      circuitClient: createCircuitClient({
        baseUrl: process.env.CIRCUIT_API_BASE_URL,
        token: process.env.CIRCUIT_API_TOKEN,
      }),
      db: admin.firestore(),
      adminSecret: process.env.BROADCAST_SECRET,
      timestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
