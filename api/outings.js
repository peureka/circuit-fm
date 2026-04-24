const admin = require("firebase-admin");

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

  const col = db.collection("outings");

  if (req.method === "GET") {
    const snapshot = await col.orderBy("date", "desc").get();
    const outings = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ outings });
  }

  if (req.method === "POST") {
    const {
      name,
      format,
      day,
      date,
      venue,
      neighbourhood,
      status,
      rsvpUrl,
      circuit_event_id,
    } = req.body || {};
    if (!name || !format) {
      return res.status(400).json({ error: "name and format required" });
    }
    const doc = await col.add({
      name,
      format,
      day: day || "",
      date: date || "",
      venue: venue || "",
      neighbourhood: neighbourhood || "",
      status: status || "draft",
      rsvpUrl: rsvpUrl || "",
      circuit_event_id: circuit_event_id || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(200).json({ ok: true, id: doc.id });
  }

  if (req.method === "PUT") {
    const { id, ...fields } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    await col.doc(id).update(fields);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    await col.doc(id).delete();
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
