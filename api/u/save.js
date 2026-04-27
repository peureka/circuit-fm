// Server-side proxy for the /u/<token> profile form.
// Validates input, enforces consent, then POSTs to Circuit's
// POST /api/organiser/v1/audience/profile with the org-side bearer token.
//
// Why proxy on circuit.fm instead of fetching from the browser: the org token
// is a write-scoped credential that must never reach a browser. The proxy
// keeps it server-only and lets us do form validation + consent enforcement
// before bothering Circuit at all.
//
// On success: 303 redirect to /u/<token>?saved=1 so the toast renders.
// On failure: 303 redirect to /u/<token>?error=<code>.

const { createCircuitClient } = require("../../lib/circuit-client");

// Same allowlists as api/u/[token].js — kept in sync to enforce server-side.
const NEIGHBOURHOOD_VALUES = new Set([
  "shoreditch", "hackney", "dalston", "soho", "clerkenwell", "mayfair",
  "notting-hill", "peckham", "brixton", "bermondsey", "camberwell", "bow",
]);
const NIGHT_VALUES = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const FORMAT_VALUES = new Set(["show", "screening", "salon", "run"]);

function toArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function filterAllowed(values, allowed) {
  return values.filter((v) => allowed.has(v));
}

function redirect(res, location) {
  // 303 forces the browser to GET on follow — POST→redirect→GET is the
  // standard form submission pattern.
  res.statusCode = 303;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

function createHandler({ circuit }) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      return res.end();
    }

    const body = req.body || {};
    const rawToken = body.token;
    const token =
      typeof rawToken === "string" && rawToken.length >= 8 && rawToken.length <= 128
        ? rawToken
        : null;

    if (!token) {
      // No usable token to redirect back to — render a minimal error.
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain");
      return res.end("Invalid token");
    }

    const back = (code) =>
      redirect(res, `/u/${encodeURIComponent(token)}?error=${encodeURIComponent(code)}`);

    // Consent must be present and on. Browser blocks empty form by `required`,
    // server enforces it as the source of truth.
    if (body.consent !== "on" && body.consent !== true && body.consent !== "true") {
      return back("CONSENT_REQUIRED");
    }

    // Sanitize Instagram handle — strip leading @, trim, cap length.
    const rawHandle = typeof body.instagramHandle === "string" ? body.instagramHandle.trim() : "";
    const cleanHandle = rawHandle ? rawHandle.replace(/^@+/, "").slice(0, 60) : null;
    if (cleanHandle && /[\s<>]/.test(cleanHandle)) {
      return back("BAD_INPUT");
    }

    const neighbourhoods = filterAllowed(toArray(body.neighbourhoods), NEIGHBOURHOOD_VALUES);
    const availableNights = filterAllowed(toArray(body.availableNights), NIGHT_VALUES);
    const formatPreferences = filterAllowed(toArray(body.formatPreferences), FORMAT_VALUES);

    if (!circuit) {
      console.error("api/u/save: circuit client unavailable (env not set)");
      return back("CIRCUIT_UNREACHABLE");
    }

    try {
      const result = await circuit.saveProfile({
        token,
        instagramHandle: cleanHandle,
        neighbourhoods,
        availableNights,
        formatPreferences,
        consent: true,
      });

      if (result && result.ok === false) {
        const code = result.code || "BAD_INPUT";
        return back(code);
      }
      return redirect(res, `/u/${encodeURIComponent(token)}?saved=1`);
    } catch (err) {
      const message = err && err.message ? err.message : "unknown";
      console.error("api/u/save: circuit saveProfile error:", message);
      // Map a few known shapes back to the client; default to UNREACHABLE.
      if (message.includes("INVALID_TOKEN")) return back("INVALID_TOKEN");
      if (message.includes("CONSENT_REQUIRED")) return back("CONSENT_REQUIRED");
      if (message.includes("BAD_INPUT") || message.includes("BAD_REQUEST")) return back("BAD_INPUT");
      return back("CIRCUIT_UNREACHABLE");
    }
  };
}

let cachedProdHandler = null;
function defaultHandler(req, res) {
  if (!cachedProdHandler) {
    const baseUrl = process.env.CIRCUIT_BASE_URL;
    const orgToken = process.env.CIRCUIT_ORGANISER_API_TOKEN;
    cachedProdHandler = createHandler({
      circuit:
        baseUrl && orgToken
          ? createCircuitClient({ baseUrl, token: orgToken })
          : null,
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
