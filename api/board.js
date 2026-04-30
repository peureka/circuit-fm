// Public leaderboard endpoint. Reads all vouches, aggregates per-voucher
// score via lib/scoring, resolves member names, returns the top 50 in
// descending score order.
//
// Public — no auth, no rate limiting in this session. Hardening lives in
// session 5 before the May 20 go-live.
//
// Response shape:
//   { entries: [{ name, score }, ...], count: N, generated_at: ISO }
//
// Deliberately minimal: we expose only the name and score. No member_id,
// no email, no internal timestamps. Rank is implicit in the array order.

const admin = require("firebase-admin");
const { topN } = require("../lib/scoring");

const DEFAULT_LIMIT = 50;
const FALLBACK_NAME = "A Circuit member";

function createHandler({ db }) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const vouchSnap = await db.collection("vouches").get();
      const vouches = vouchSnap.docs.map((d) => d.data());
      const ranked = topN(vouches, DEFAULT_LIMIT);

      const entries = await Promise.all(
        ranked.map(async ({ memberId, score }) => {
          let name = FALLBACK_NAME;
          try {
            const memberSnap = await db
              .collection("members")
              .doc(memberId)
              .get();
            if (memberSnap.exists) {
              const data = memberSnap.data();
              if (
                data &&
                typeof data.name === "string" &&
                data.name.trim().length > 0
              ) {
                name = data.name.trim();
              }
            }
          } catch (err) {
            console.error(`Member lookup failed for ${memberId}:`, err);
          }
          return { name, score };
        }),
      );

      // Edge-cache the response. 60s fresh, 30s stale-while-revalidate.
      // A new vouch showing up within 60s isn't time-critical; the cache
      // absorbs any traffic spike against the board page.
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=30",
      );
      return res.status(200).json({
        entries,
        count: entries.length,
        generated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Board error:", err);
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
    cachedProdHandler = createHandler({ db: admin.firestore() });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
