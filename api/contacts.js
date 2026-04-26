const { Resend } = require("resend");
const admin = require("firebase-admin");
const { renderConfirmation } = require("../lib/templates");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = async function handler(req, res) {
  const secret = process.env.BROADCAST_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "GET") {
    const snapshot = await db
      .collection("signups")
      .orderBy("created_at", "desc")
      .get();

    const contacts = snapshot.docs.map((doc) => ({
      email: doc.id,
      created_at: doc.data().created_at
        ? doc.data().created_at.toDate().toISOString()
        : null,
    }));

    return res.status(200).json({ contacts });
  }

  if (req.method === "POST") {
    const { email } = req.body || {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const clean = email.trim().toLowerCase();
    const resendKey = process.env.RESEND_API_KEY;
    const segmentId = process.env.RESEND_SEGMENT_ID;
    const from =
      process.env.RESEND_FROM || "Circuit FM <onboarding@resend.dev>";

    try {
      // Write to Firestore
      await db.collection("signups").doc(clean).set({
        email: clean,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Add to Resend segment
      let duplicate = false;
      if (resendKey && segmentId) {
        const resend = new Resend(resendKey);
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

        // Fire-and-forget confirmation email
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
      console.error("Add contact error:", err);
      return res.status(500).json({ error: "Failed to add contact" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};
