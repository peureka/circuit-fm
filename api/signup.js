const { Resend } = require("resend");
const admin = require("firebase-admin");
const { renderConfirmation } = require("../lib/templates");

function createHandler({ db, resend, segmentId, from, timestamp }) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body || {};
    const { email, name } = body;

    // Length caps mirror the Firestore schema rule on signups. Defensive:
    // the admin SDK bypasses rules, so we must enforce bounds here too.
    const MAX_EMAIL_LEN = 100;
    const MAX_NAME_LEN = 100;

    if (
      !email ||
      typeof email !== "string" ||
      !email.includes("@") ||
      email.length > MAX_EMAIL_LEN
    ) {
      return res.status(400).json({ error: "Invalid email" });
    }

    if (name !== undefined) {
      if (
        typeof name !== "string" ||
        name.trim().length === 0 ||
        name.length > MAX_NAME_LEN
      ) {
        return res.status(400).json({ error: "Invalid name" });
      }
    }

    const clean = email.trim().toLowerCase();
    const cleanName = typeof name === "string" ? name.trim() : null;

    try {
      const docData = {
        email: clean,
        created_at: timestamp(),
      };
      if (cleanName) docData.name = cleanName;

      await db
        .collection("signups")
        .doc(clean)
        .set(docData, { merge: true });

      let duplicate = false;
      if (resend && segmentId) {
        try {
          await resend.contacts.create({
            email: clean,
            segments: [{ id: segmentId }],
          });
        } catch (contactErr) {
          if (
            contactErr.statusCode === 409 ||
            (contactErr.message && contactErr.message.includes("already"))
          ) {
            duplicate = true;
          } else {
            console.error("Resend contact error:", contactErr);
          }
        }

        if (!duplicate) {
          resend.emails
            .send({
              from,
              to: [clean],
              subject: "you're on the list.",
              html: renderConfirmation(),
            })
            .catch((err) => console.error("Confirmation email error:", err));
        }
      }

      return res.status(200).json({ ok: true, duplicate });
    } catch (err) {
      console.error("Signup error:", err);
      return res.status(500).json({ error: "Something went wrong" });
    }
  };
}

// Production handler: lazy-initialize Firebase + Resend on first invocation so
// that `require('./api/signup')` works in tests without env vars set.
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
    cachedProdHandler = createHandler({
      db: admin.firestore(),
      resend: resendKey ? new Resend(resendKey) : null,
      segmentId: process.env.RESEND_SEGMENT_ID,
      from:
        process.env.RESEND_FROM || "Circuit FM <onboarding@resend.dev>",
      timestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
