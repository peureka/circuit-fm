import admin from "firebase-admin";
admin.initializeApp({ projectId: "cccircuit" });
const db = admin.firestore();
const collections = ["cards", "members", "broadcasts", "outings", "vouches", "attendance", "signups", "releases"];
for (const c of collections) {
  try {
    const snap = await db.collection(c).count().get();
    console.log(c, snap.data().count);
  } catch (e) {
    console.log(c, "ERR", e.message);
  }
}
process.exit(0);
