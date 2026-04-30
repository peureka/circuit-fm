// Standalone content release for people who appear on Circuit FM camera
// formats (The List, event footage) but are NOT joining Circuit FM.
//
// Two paths for content consent:
//   1. They join Circuit FM. Signup at circuit.fm + agreeing to /terms
//      (Section 3) IS the release. No separate form. Optimised for the
//      single most important conversion moment in The List format.
//   2. They don't join. Ciara texts circuit.fm/release?shoot=<day> to
//      anyone who appeared on camera but didn't sign up. They land here,
//      sign once, footage is releasable.
//
// This endpoint is path 2. Writes a document to Firestore `releases`
// collection keyed on lowercased email. The referrer URL (full
// window.location.href captured client-side) is preserved so a query
// param like ?shoot=day1 is traceable.

const admin = require("firebase-admin");

function createHandler({ db, timestamp }) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body || {};
    const { name, email, consent, referrer } = body;

    const MAX_NAME = 100;
    const MAX_EMAIL = 254;
    const MAX_REFERRER = 500;

    if (
      typeof name !== "string" ||
      name.trim().length === 0 ||
      name.length > MAX_NAME
    ) {
      return res.status(400).json({ error: "Invalid name" });
    }
    if (
      typeof email !== "string" ||
      !email.includes("@") ||
      email.length > MAX_EMAIL
    ) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (consent !== true) {
      return res.status(400).json({ error: "Consent required" });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanReferrer =
      typeof referrer === "string" && referrer.length > 0
        ? referrer.slice(0, MAX_REFERRER)
        : null;

    try {
      const docData = {
        name: cleanName,
        email: cleanEmail,
        consent: true,
        consent_at: timestamp(),
      };
      if (cleanReferrer) docData.referrer = cleanReferrer;

      // Keyed on email so re-submissions update rather than duplicate.
      // The most recent submission overwrites the previous (same person
      // re-submitting on a different shoot day will have the latest
      // referrer captured).
      await db
        .collection("releases")
        .doc(cleanEmail)
        .set(docData, { merge: true });

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Release error:", err);
      return res.status(500).json({ error: "Something went wrong" });
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
    cachedProdHandler = createHandler({
      db: admin.firestore(),
      timestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
