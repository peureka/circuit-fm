// Admin: list all cards + stock summary. Used by the admin panel's Cards
// tab to show Ciara how many unassigned cards she has in the tin, what's
// been handed out, and who has which.
//
// Auth: Bearer BROADCAST_SECRET.

const admin = require("firebase-admin");

const FALLBACK_MEMBER_NAME = "A Circuit FM member";
const STATUS_ORDER = { unassigned: 0, active: 1, lost: 2, disabled: 3 };

function statusRank(status) {
  if (status in STATUS_ORDER) return STATUS_ORDER[status];
  return 4;
}

function createHandler({ db, adminSecret }) {
  return async function handler(req, res) {
    const auth = req.headers && req.headers.authorization;
    if (!adminSecret || auth !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const snap = await db.collection("cards").get();
      const raw = snap.docs.map((d) => ({ chipUid: d.id, ...d.data() }));

      // Resolve member names for active / lost cards (anything with a member_id).
      const cards = await Promise.all(
        raw.map(async (card) => {
          let memberName = null;
          if (card.member_id) {
            try {
              const memberSnap = await db
                .collection("members")
                .doc(card.member_id)
                .get();
              if (
                memberSnap.exists &&
                typeof memberSnap.data().name === "string" &&
                memberSnap.data().name.trim().length > 0
              ) {
                memberName = memberSnap.data().name.trim();
              } else {
                memberName = FALLBACK_MEMBER_NAME;
              }
            } catch (err) {
              console.error(
                `Member lookup failed for ${card.member_id}:`,
                err,
              );
              memberName = FALLBACK_MEMBER_NAME;
            }
          }
          return {
            chipUid: card.chipUid,
            status: card.status || "unassigned",
            member_id: card.member_id || null,
            member_name: memberName,
            issued_at: card.issued_at || null,
            created_at: card.created_at || null,
          };
        }),
      );

      // Order: unassigned first (what the curator needs most often),
      // then active, then lost / disabled. Stable sort within a status
      // by chipUid for predictability.
      cards.sort((a, b) => {
        const r = statusRank(a.status) - statusRank(b.status);
        if (r !== 0) return r;
        return a.chipUid.localeCompare(b.chipUid);
      });

      const counts = {
        total: cards.length,
        unassigned: cards.filter((c) => c.status === "unassigned").length,
        active: cards.filter((c) => c.status === "active").length,
        lost: cards.filter((c) => c.status === "lost").length,
        disabled: cards.filter((c) => c.status === "disabled").length,
      };

      return res.status(200).json({ cards, counts });
    } catch (err) {
      console.error("Cards list error:", err);
      return res.status(500).json({ error: "Something went wrong" });
    }
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
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
