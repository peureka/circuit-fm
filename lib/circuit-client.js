// Thin client for Circuit's organiser API (meetcircuit.com).
// The only call-site today is api/signup.js → upsertAudience. Add more
// methods here as we wire further surfaces.
//
// Failure handling lives in the call-site: this module just maps a successful
// 2xx response into the inner `data` payload, and throws on anything else.

function createCircuitClient({ baseUrl, token, fetchImpl = global.fetch }) {
  if (!baseUrl) throw new Error("circuit-client: baseUrl is required");
  if (!token) throw new Error("circuit-client: token is required");

  const trimmedBase = baseUrl.replace(/\/+$/, "");

  async function request(path, init = {}) {
    const url = `${trimmedBase}${path}`;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
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
  };
}

module.exports = { createCircuitClient };
