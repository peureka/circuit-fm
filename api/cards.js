// Admin: list all cards + stock summary. Used by the admin panel's Cards
// tab to show Ciara how many unassigned cards she has in the tin, what's
// been handed out, and who has which.
//
// Post-consolidation: reads from Circuit's Postgres via the organiser API
// (GET /api/organiser/v1/cards). The shape returned to admin.html is kept
// stable: { cards: [{chipUid, status, member_id, member_name, issued_at}],
//           counts: {total, unassigned, active, lost, disabled} }.
//
// Auth: Bearer BROADCAST_SECRET (cccircuit admin gate, not the Circuit API
// token — that lives in env, consumed by circuitClient).

const { createCircuitClient } = require("../lib/circuit-client");

const FALLBACK_MEMBER_NAME = "A Circuit member";
const STATUS_ORDER = { unassigned: 0, active: 1, lost: 2, disabled: 3 };
const PAGE_LIMIT = 200;
const MAX_PAGES = 50; // hard cap to prevent infinite paging on a runaway cursor

function statusRank(status) {
  if (status in STATUS_ORDER) return STATUS_ORDER[status];
  return 4;
}

// Map a Circuit reservation row to the cccircuit-web admin shape.
function toAdminCard(reservation) {
  const status = reservation.voided
    ? "disabled"
    : reservation.claim
    ? "active"
    : "unassigned";
  return {
    chipUid: reservation.chipUid,
    memberCode: reservation.memberCode,
    status,
    member_id: reservation.claim ? reservation.claim.globalProfile.id : null,
    member_name: reservation.claim
      ? reservation.claim.globalProfile.displayName || FALLBACK_MEMBER_NAME
      : null,
    issued_at: reservation.claim ? reservation.claim.claimedAt : null,
    created_at: reservation.reservedAt,
  };
}

function createHandler({ circuitClient, adminSecret }) {
  return async function handler(req, res) {
    const auth = req.headers && req.headers.authorization;
    if (!adminSecret || auth !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      // Page through all reservations. The organiser API returns
      // { items, nextCursor } and is cursor-paginated for stability.
      const all = [];
      let cursor;
      for (let page = 0; page < MAX_PAGES; page++) {
        const resp = await circuitClient.listCards({
          limit: PAGE_LIMIT,
          cursor,
        });
        for (const item of resp.items || []) all.push(toAdminCard(item));
        if (!resp.nextCursor) break;
        cursor = resp.nextCursor;
      }

      // Order: unassigned first (what the curator needs most often),
      // then active, then lost / disabled. Stable sort within a status
      // by chipUid for predictability. chipUid may be null for
      // reservations that haven't been encoded yet — those sort to
      // the end of their status bucket.
      all.sort((a, b) => {
        const r = statusRank(a.status) - statusRank(b.status);
        if (r !== 0) return r;
        const ax = a.chipUid || "";
        const bx = b.chipUid || "";
        return ax.localeCompare(bx);
      });

      const counts = {
        total: all.length,
        unassigned: all.filter((c) => c.status === "unassigned").length,
        active: all.filter((c) => c.status === "active").length,
        lost: all.filter((c) => c.status === "lost").length,
        disabled: all.filter((c) => c.status === "disabled").length,
      };

      return res.status(200).json({ cards: all, counts });
    } catch (err) {
      console.error("Cards list error:", err);
      return res.status(500).json({ error: "Something went wrong" });
    }
  };
}

let cachedProdHandler = null;
function defaultHandler(req, res) {
  if (!cachedProdHandler) {
    cachedProdHandler = createHandler({
      circuitClient: createCircuitClient({
        baseUrl: process.env.CIRCUIT_API_BASE_URL,
        token: process.env.CIRCUIT_API_TOKEN,
      }),
      adminSecret: process.env.BROADCAST_SECRET,
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
