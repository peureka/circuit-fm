// Venues CRUD. Admin-authed (Bearer BROADCAST_SECRET).
//
// POST is an upsert keyed on a slug derived from the venue name, so the
// seed script (scripts/seed-venues.js) can re-run idempotently. Repeat POSTs
// of the same venue merge fields without duplicating or resetting createdAt.

const admin = require("firebase-admin");

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createHandler({ db, adminSecret, timestamp }) {
  return async function handler(req, res) {
    const auth = req.headers && req.headers.authorization;
    if (!adminSecret || auth !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const col = db.collection("venues");

    if (req.method === "GET") {
      const snapshot = await col.orderBy("name").get();
      const venues = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json({ venues });
    }

    if (req.method === "POST") {
      const { name, neighbourhood, format, contact, notes } = req.body || {};
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "name required" });
      }
      const slug = slugify(name);
      if (!slug) return res.status(400).json({ error: "invalid name" });

      const ref = col.doc(slug);
      const existing = await ref.get();

      const writeData = {
        name: name.trim(),
        neighbourhood: neighbourhood || "",
        format: format || "",
        contact: contact || "",
        notes: notes || "",
      };
      if (!existing.exists) {
        writeData.createdAt = timestamp();
      }

      await ref.set(writeData, { merge: true });
      return res.status(200).json({ ok: true, id: slug });
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
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
module.exports.slugify = slugify;
