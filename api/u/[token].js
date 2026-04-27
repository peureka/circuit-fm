// Subscriber profile form for Circuit FM. Lives on circuit.fm/u/<token>.
// Renders an HTML form pre-filled from Circuit's
// GET /api/organiser/v1/audience/profile (when that endpoint is live).
// The form posts to /api/u/save which proxies to Circuit.
//
// Why on circuit.fm and not meetcircuit.com: the recipient signed up at
// circuit.fm and knows that brand. The Circuit operator platform's nav and
// design language are wrong for a guest-facing surface. The data still lives
// on Circuit — circuit.fm is just the rendering surface.

const { createCircuitClient } = require("../../lib/circuit-client");
const { escapeHtml } = require("../../lib/templates");

// Edit these lists to change what the form offers; the values must match the
// strings stored on Circuit Guest.{neighbourhoods,availableNights,formatPreferences}.
// Format preference values map 1:1 to Circuit's FormatType enum so admin can
// segment by Event.formatType against subscriber prefs without translation.
const NEIGHBOURHOODS = [
  ["shoreditch", "Shoreditch"],
  ["hackney", "Hackney"],
  ["dalston", "Dalston"],
  ["soho", "Soho"],
  ["clerkenwell", "Clerkenwell"],
  ["mayfair", "Mayfair"],
  ["notting-hill", "Notting Hill"],
  ["peckham", "Peckham"],
  ["brixton", "Brixton"],
  ["bermondsey", "Bermondsey"],
  ["camberwell", "Camberwell"],
  ["bow", "Bow"],
];

const NIGHTS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
];

const FORMATS = [
  ["show", "Live shows"],
  ["screening", "Screenings"],
  ["salon", "Salons & talks"],
  ["run", "Runs & movement"],
];

function renderChips(name, options, selected) {
  const set = new Set(selected || []);
  return options
    .map(([value, label]) => {
      const id = `${name}-${value}`;
      const checked = set.has(value) ? " checked" : "";
      return `<label class="chip" for="${escapeHtml(id)}">
  <input type="checkbox" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}"${checked}>
  <span>${escapeHtml(label)}</span>
</label>`;
    })
    .join("\n");
}

function renderPage({ token, profile, savedFlash, errorCode }) {
  const safeToken = escapeHtml(token);
  const email = escapeHtml(profile?.email ?? "");
  const organiserName = escapeHtml(profile?.organiserName ?? "Circuit FM");
  const handle = escapeHtml(
    (profile?.instagramHandle ?? "").replace(/^@+/, "")
  );

  const errorBanner =
    errorCode === "CONSENT_REQUIRED"
      ? `<p class="alert">Please tick the consent box at the bottom before saving.</p>`
      : errorCode === "BAD_INPUT"
      ? `<p class="alert">Some of the values weren&rsquo;t valid. Please review and try again.</p>`
      : errorCode === "INVALID_TOKEN"
      ? `<p class="alert">This profile link is no longer valid. Sign up again at <a href="/">circuit.fm</a> to get a fresh one.</p>`
      : errorCode === "CIRCUIT_UNREACHABLE"
      ? `<p class="alert">We couldn&rsquo;t save your preferences just now. Try again in a minute.</p>`
      : "";

  const editingFor = email
    ? `<p class="lead-meta">Editing for <span class="mono">${email}</span>.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Your profile · Circuit FM</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='none'><rect width='32' height='32' rx='6' fill='%230A0A0A'/><circle cx='16' cy='16' r='9' stroke='%23FF4400' stroke-width='2.5' fill='none'/></svg>">
  <style>
    *,*::before,*::after { margin:0; padding:0; box-sizing:border-box; }
    :root {
      --bg: #0A0A0A;
      --surface: rgba(255,255,255,0.03);
      --text-primary: #F5F5F5;
      --text-secondary: #A0A0A0;
      --text-tertiary: #666;
      --accent: #FF4400;
      --accent-dim: rgba(255, 68, 0, 0.3);
      --border: rgba(255,255,255,0.12);
      --border-strong: rgba(255,255,255,0.25);
      --sans: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
      --mono: "SF Mono", "Cascadia Code", "Fira Code", "Consolas", monospace;
    }
    html, body { background: var(--bg); color: var(--text-primary); font-family: var(--sans); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { min-height: 100vh; min-height: 100dvh; }

    .page { max-width: 560px; margin: 0 auto; padding: 32px 24px 80px; }

    nav { display: flex; align-items: center; margin-bottom: 56px; }
    .wordmark { font-size: 16px; font-weight: 600; letter-spacing: -0.02em; }

    h1 { font-size: clamp(28px, 5vw, 36px); font-weight: 600; letter-spacing: -0.025em; line-height: 1.1; margin-bottom: 16px; }
    .org-eyebrow { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; letter-spacing: 0.01em; }
    .lead { font-size: 15px; line-height: 1.5; color: var(--text-secondary); margin-bottom: 12px; }
    .lead-meta { font-size: 13px; color: var(--text-tertiary); margin-bottom: 0; }
    .mono { font-family: var(--mono); }

    .alert { font-size: 13px; line-height: 1.5; color: var(--text-primary); background: rgba(255,68,0,0.08); border: 1px solid var(--accent-dim); border-radius: 4px; padding: 12px 16px; margin: 24px 0 0; }
    .alert a { color: var(--accent); }

    form { margin-top: 48px; display: flex; flex-direction: column; gap: 36px; }

    fieldset { border: 0; padding: 0; }
    legend { font-size: 16px; font-weight: 500; padding: 0; margin-bottom: 6px; }
    .hint { font-size: 13px; line-height: 1.5; color: var(--text-tertiary); margin-bottom: 14px; }

    .input-wrap { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); background: var(--surface); border-radius: 2px; height: 44px; padding: 0 14px; transition: border-color 100ms linear; }
    .input-wrap:focus-within { border-color: var(--accent); }
    .input-wrap .prefix { color: var(--text-secondary); font-family: var(--sans); font-size: 15px; }
    .input-wrap input { flex: 1; background: none; border: 0; outline: none; color: var(--text-primary); font-family: var(--sans); font-size: 15px; min-width: 0; }
    .input-wrap input::placeholder { color: rgba(255,255,255,0.25); }

    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { position: relative; cursor: pointer; user-select: none; }
    .chip input { position: absolute; opacity: 0; width: 0; height: 0; }
    .chip span { display: inline-block; padding: 8px 14px; border: 1px solid var(--border); border-radius: 999px; font-size: 14px; line-height: 1.2; color: var(--text-primary); transition: background-color 100ms linear, border-color 100ms linear, color 100ms linear; }
    .chip:hover span { border-color: var(--border-strong); }
    .chip input:checked + span { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 500; }
    .chip input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }

    .consent { display: flex; gap: 12px; align-items: flex-start; padding: 16px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); }
    .consent input { margin-top: 3px; accent-color: var(--accent); width: 16px; height: 16px; flex-shrink: 0; cursor: pointer; }
    .consent label { font-size: 14px; line-height: 1.5; color: var(--text-secondary); cursor: pointer; }

    .actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; }
    .privacy-link { font-size: 12px; color: var(--text-tertiary); text-decoration: underline; }
    .privacy-link:hover { color: var(--text-secondary); }
    .cta { background: var(--accent); color: var(--bg); border: 0; border-radius: 2px; font-family: var(--sans); font-size: 15px; font-weight: 600; padding: 0 24px; height: 44px; cursor: pointer; transition: opacity 100ms linear; }
    .cta:hover { opacity: 0.85; }
    .cta:active { transform: translateY(1px); }

    /* Toast — slides up, holds, fades. Pure CSS, no JS dependency. */
    .toast { position: fixed; left: 50%; bottom: 32px; transform: translate(-50%, 16px); background: var(--accent); color: var(--bg); padding: 12px 24px; border-radius: 2px; font-family: var(--sans); font-size: 14px; font-weight: 600; opacity: 0; pointer-events: none; box-shadow: 0 12px 32px rgba(0,0,0,0.4); animation: toast 3s ease-out forwards; }
    @keyframes toast {
      0%   { opacity: 0; transform: translate(-50%, 16px); }
      10%  { opacity: 1; transform: translate(-50%, 0); }
      85%  { opacity: 1; transform: translate(-50%, 0); }
      100% { opacity: 0; transform: translate(-50%, -8px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .toast { animation: none; opacity: 1; transform: translate(-50%, 0); }
    }

    @media (min-width: 720px) {
      .page { padding: 56px 24px 96px; }
      nav { margin-bottom: 72px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <nav><span class="wordmark">Circuit FM</span></nav>

    <header>
      <p class="org-eyebrow">${organiserName}</p>
      <h1>Your profile</h1>
      <p class="lead">We use this to invite you to outings you&rsquo;d actually go to. Four short questions. Edit any time.</p>
      ${editingFor}
      ${errorBanner}
    </header>

    <form action="/api/u/save" method="POST">
      <input type="hidden" name="token" value="${safeToken}">

      <fieldset>
        <legend>Instagram <span style="color:var(--text-tertiary);font-weight:400">(optional)</span></legend>
        <p class="hint">So we can recognise you at the door. We don&rsquo;t post or follow anyone.</p>
        <div class="input-wrap">
          <span class="prefix">@</span>
          <input type="text" name="instagramHandle" value="${handle}" placeholder="yourhandle" maxlength="60" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">
        </div>
      </fieldset>

      <fieldset>
        <legend>Where do you spend time?</legend>
        <p class="hint">Pick anywhere you&rsquo;d happily travel to for an evening.</p>
        <div class="chips">
${renderChips("neighbourhoods", NEIGHBOURHOODS, profile?.neighbourhoods)}
        </div>
      </fieldset>

      <fieldset>
        <legend>Which nights work for you?</legend>
        <p class="hint">Most outings are Wed&ndash;Sat. Pick all that apply.</p>
        <div class="chips">
${renderChips("availableNights", NIGHTS, profile?.availableNights)}
        </div>
      </fieldset>

      <fieldset>
        <legend>What kind of outings?</legend>
        <p class="hint">Pick the formats that draw you in.</p>
        <div class="chips">
${renderChips("formatPreferences", FORMATS, profile?.formatPreferences)}
        </div>
      </fieldset>

      <div class="consent">
        <input type="checkbox" name="consent" id="consent" value="on" required>
        <label for="consent">I&rsquo;m OK with ${organiserName} using this to invite me to relevant outings. I can change my mind any time.</label>
      </div>

      <div class="actions">
        <a class="privacy-link" href="https://meetcircuit.com/privacy">Privacy policy</a>
        <button type="submit" class="cta">Save preferences</button>
      </div>
    </form>
  </div>

  ${savedFlash ? `<div class="toast" role="status" aria-live="polite">Saved.</div>` : ""}
</body>
</html>`;
}

function createHandler({ circuit, baseUrl, token: orgToken }) {
  // circuit is optional — if Circuit isn't configured, we render an empty
  // form rather than 500. That keeps the page useful for verification even
  // before circuit-side env is plumbed.
  return async function handler(req, res) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    // HEAD must mirror GET (status + headers, empty body) so link previewers
    // (Slack, iMessage, Telegram) and uptime monitors don't see 405. Vercel
    // doesn't auto-derive HEAD from GET — handle explicitly. We skip the
    // Circuit fetch on HEAD since we don't render a body anyway.
    const isHead = req.method === "HEAD";
    if (req.method !== "GET" && !isHead) {
      res.status(405);
      res.setHeader("Allow", "GET, HEAD");
      return res.send(renderPage({ token: "", profile: null, savedFlash: false, errorCode: "BAD_METHOD" }));
    }

    const token = req.query && req.query.token;
    if (!token || typeof token !== "string" || token.length < 8) {
      res.status(400);
      if (isHead) return res.end();
      return res.send(renderPage({ token: "", profile: null, savedFlash: false, errorCode: "INVALID_TOKEN" }));
    }

    if (isHead) {
      // We've validated the token shape; previewers / monitors get 200.
      // Don't bother Circuit for the profile data — there's no body to fill.
      res.status(200);
      return res.end();
    }

    const savedFlash = req.query && req.query.saved === "1";
    const errorCode =
      req.query && typeof req.query.error === "string" ? req.query.error : null;

    let profile = null;
    if (circuit) {
      try {
        profile = await circuit.getProfile(token);
      } catch (err) {
        // Don't fail the page on a Circuit blip — just render an empty form.
        // The user can still fill it out and the save path will surface any
        // real issue.
        console.error("circuit getProfile error:", err && err.message ? err.message : err);
      }
    }

    res.status(200);
    return res.send(renderPage({ token, profile, savedFlash, errorCode }));
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
      baseUrl,
      token: orgToken,
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
module.exports.NEIGHBOURHOODS = NEIGHBOURHOODS;
module.exports.NIGHTS = NIGHTS;
module.exports.FORMATS = FORMATS;
