// Thin client for Circuit's organiser API (meetcircuit.com).
// The only call-site today is api/signup.js → upsertAudience. Add more
// methods here as we wire further surfaces.
//
// Failure handling lives in the call-site: this module just maps a successful
// 2xx response into the inner `data` payload, and throws on anything else.

function createCircuitClient({ baseUrl, token, fetchImpl = global.fetch }) {
  // Strip whitespace and accidental surrounding quotes (a Vercel env value
  // pasted as `"https://meetcircuit.com"` is stored verbatim with the
  // quote characters and silently breaks every URL we build from it).
  const cleanBase =
    typeof baseUrl === "string"
      ? baseUrl.trim().replace(/^['"]|['"]$/g, "")
      : baseUrl;
  const cleanToken =
    typeof token === "string"
      ? token.trim().replace(/^['"]|['"]$/g, "")
      : token;
  if (!cleanBase) throw new Error("circuit-client: baseUrl is required");
  if (!cleanToken) throw new Error("circuit-client: token is required");

  // One-time temporary breadcrumb so we can verify the quote-stripping fix
  // is in the deployed bundle. Logs only the first 30 chars of the cleaned
  // base url and the token prefix — never the full token. Remove once the
  // chip-tap landing is confirmed working in prod.
  console.log(
    "[circuit-client] init base=" +
      cleanBase.slice(0, 30) +
      " tokenPrefix=" +
      cleanToken.slice(0, 12),
  );

  const trimmedBase = cleanBase.replace(/\/+$/, "");

  async function request(path, init = {}) {
    const url = `${trimmedBase}${path}`;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${cleanToken}`,
      ...(init.headers || {}),
    };
    const response = await fetchImpl(url, { ...init, headers });
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // fall through; we'll throw below
      }
    }
    if (!response.ok) {
      const code = parsed?.code ? ` [${parsed.code}]` : "";
      const message = parsed?.error || `${response.status} ${response.statusText}`;
      throw new Error(`circuit ${path} failed${code}: ${message}`);
    }
    return parsed?.data ?? null;
  }

  return {
    async upsertAudience({ email, name, source }) {
      return request("/api/organiser/v1/audience/upsert", {
        method: "POST",
        body: JSON.stringify({
          email,
          ...(name ? { name } : {}),
          source: source || "circuitfm-signup",
        }),
      });
    },

    // GET the existing profile values for a subscriber by their profileToken,
    // so the /u/<token> form can pre-fill on revisit. Returns null on 404
    // (token unknown OR endpoint not yet live on Circuit) so callers can fall
    // back gracefully to an empty form.
    async getProfile(profileToken) {
      const path = `/api/organiser/v1/audience/profile?token=${encodeURIComponent(
        profileToken,
      )}`;
      try {
        return await request(path, { method: "GET" });
      } catch (err) {
        if (err.message && err.message.includes("404")) return null;
        if (err.message && err.message.includes("NOT_FOUND")) return null;
        throw err;
      }
    },

    async saveProfile({
      token,
      instagramHandle,
      neighbourhoods,
      availableNights,
      formatPreferences,
      consent,
    }) {
      return request("/api/organiser/v1/audience/profile", {
        method: "POST",
        body: JSON.stringify({
          token,
          instagramHandle: instagramHandle || null,
          neighbourhoods: neighbourhoods || [],
          availableNights: availableNights || [],
          formatPreferences: formatPreferences || [],
          consent: !!consent,
        }),
      });
    },

    // ─── Cards (post-consolidation, talks to Circuit Postgres) ──────────

    // Look up a card by its NFC chipUid. Returns
    // { memberCode, chipUid, voided, claim?: { claimedAt, globalProfile } }
    // Returns null on 404 so callers can render an "unknown chip" state.
    async lookupCardByChip(chipUid) {
      const path = `/api/organiser/v1/cards/by-chip/${encodeURIComponent(chipUid)}`;
      try {
        return await request(path, { method: "GET" });
      } catch (err) {
        if (err.message && err.message.includes("NOT_FOUND")) return null;
        if (err.message && err.message.includes("404")) return null;
        throw err;
      }
    },

    // List the organiser's reservations (cursor-paginated). Optional limit
    // and cursor for follow-up pages.
    async listCards({ limit, cursor } = {}) {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return request(`/api/organiser/v1/cards${qs}`, { method: "GET" });
    },

    // Reserve a fresh card slot. memberCode is server-generated unless
    // supplied. chipUid is optional (NFC-encoded later).
    // Returns { memberCode, chipUid, reservedAt }.
    async reserveCard({ memberCode, chipUid } = {}) {
      const body = {};
      if (memberCode) body.memberCode = memberCode;
      if (chipUid) body.chipUid = chipUid;
      return request("/api/organiser/v1/cards/reserve", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    // Bind a card (looked up by NFC chipUid) to a GlobalProfile by email.
    // Idempotent on same email; throws on different-email or voided card.
    // Returns { memberCode, chipUid, claim: { claimedAt, globalProfileId },
    //          created }.
    async assignCardByChip({ chipUid, email, displayName }) {
      const body = { email };
      if (displayName) body.displayName = displayName;
      return request(
        `/api/organiser/v1/cards/by-chip/${encodeURIComponent(chipUid)}/assign`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },

    // ─── Campaigns (broadcasts) ─────────────────────────────────────────

    // Create a draft campaign on Circuit. Returns { id, status, createdAt }.
    async createCampaign({ name, subject, bodyText, segmentFilters, sendAt }) {
      const body = { name, subject, bodyText };
      if (segmentFilters) body.segmentFilters = segmentFilters;
      if (sendAt) body.sendAt = sendAt;
      return request("/api/organiser/v1/campaigns", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  };
}

module.exports = { createCircuitClient };
