// Tap landing route — dispatcher for both legacy and Phase-3 cards.
//
// LEGACY (chipUid, UUID): existing /c/<chipUid> resolves through
// Firestore `cards` + `members` collections. Renders the simple
// "vouching member → get on the list" landing.
//
// PHASE 3 (memberCode, "mbr_*"): a member's NFC card emits
// https://circuit.fm/c/<memberCode>. The dispatcher detects the
// "mbr_" prefix and forwards to the meetcircuit.com API to fetch
// the member's circle (their mutual connections), then renders the
// 24-hour preview with names list + lapse-to-join CTA.
//
// 24-hour window for non-members is enforced via a per-memberCode
// cookie. The first view sets the cookie with timestamp; subsequent
// views within 24h render the names list; after 24h render the
// "your window closed" lapse view.
//
// CIRCUIT_FM_APP_SPEC §3 (Sub-PR 11B). Companion API endpoint at
// meetcircuit.com /api/circles/preview/[memberCode] (Sub-PR 11A).

const admin = require("firebase-admin");
const { escapeHtml } = require("../../lib/templates");

const CIRCUIT_API_BASE =
  process.env.CIRCUIT_API_URL || "https://meetcircuit.com";
const CIRCLE_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

function wrapPage(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Circuit</title>
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  html,body{height:100%}
  body{background:#000;color:#fff;font-family:"Inter","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .page{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;padding:24px}
  nav{display:flex;justify-content:space-between;align-items:center}
  .wordmark{font-family:"SF Mono","JetBrains Mono","Fira Code",monospace;font-size:18px;font-weight:600;letter-spacing:-0.02em}
  main{flex:1;display:flex;flex-direction:column;justify-content:center;max-width:640px;margin:0 auto;width:100%;padding:32px 0}
  h1{font-family:"Inter","Helvetica Neue",sans-serif;font-size:clamp(28px,5vw,44px);font-weight:500;line-height:1.15;letter-spacing:-0.02em;margin-bottom:24px}
  .strapline{font-size:14px;color:#A0A0A0;margin-bottom:40px;line-height:1.6}
  .cta{display:inline-block;background:#FF4400;color:#000;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:2px;font-size:14px;letter-spacing:0.02em}
  footer{font-size:12px;color:#A0A0A0;margin-top:auto;padding-top:24px;display:flex;gap:16px}
  footer a{color:#A0A0A0;text-decoration:underline}
</style>
</head>
<body>
<div class="page">
<nav><span class="wordmark">Circuit</span></nav>
<main>${body}</main>
<footer><a href="https://circuit.fm">circuit.fm</a><a href="https://circuit.fm/privacy">Privacy</a><a href="https://circuit.fm/terms">Terms</a></footer>
</div>
</body>
</html>`;
}

function renderLanding({ memberName, memberId }) {
  const safeName = escapeHtml(memberName);
  const safeId = encodeURIComponent(memberId);
  // Per CIRCUIT_FM_DESIGN_BRIEF.md §B.3 — don't repeat the homepage hero
  // verbatim. The Card is the gesture; the copy names the gesture and
  // moves on. The homepage already carries the post-Soho tagline.
  return wrapPage(`
<h1>${safeName} gave you their card.</h1>
<p class="strapline">That's how Circuit works.</p>
<a class="cta" href="/?v=${safeId}">Get on the list →</a>`);
}

function renderNotFound() {
  return wrapPage(`
<h1>Card not recognised.</h1>
<p class="strapline">This card isn't active in Circuit. If you think that's wrong, ask the person who gave it to you to check with the curator.</p>
<a class="cta" href="/">Back to Circuit →</a>`);
}

function renderGone() {
  return wrapPage(`
<h1>This card is no longer active.</h1>
<p class="strapline">The member it belonged to has retired or replaced it. Ask them for their new card, or get on the list directly below.</p>
<a class="cta" href="/">Get on the list →</a>`);
}

function renderError() {
  return wrapPage(`
<h1>Something went wrong.</h1>
<p class="strapline">We couldn't resolve this card right now. Please try again shortly, or get on the list directly below.</p>
<a class="cta" href="/">Get on the list →</a>`);
}

/// First letter of the (trimmed) display name, uppercased. Used as the
/// fallback inside the avatar circle when a member doesn't have a
/// photoUrl. Empty input -> '·' so the circle still has *something*
/// visually grounded rather than being a void.
function avatarInitial(name) {
  if (!name) return "·";
  const trimmed = String(name).trim();
  if (!trimmed) return "·";
  return trimmed[0].toUpperCase();
}

/// Avatar markup — circular img with srcset fallback to letter initial.
/// Inline style only because this page bypasses the build pipeline; we
/// don't have a CSS-in-JS layer here. Sized 32px in the list, 56px on
/// the subject header.
function avatarHtml({ photoUrl, displayName, size }) {
  const initial = escapeHtml(avatarInitial(displayName));
  const safeAlt = escapeHtml(displayName || "");
  const dim = size === "lg" ? 56 : 32;
  const fontSize = size === "lg" ? 22 : 14;
  if (photoUrl) {
    const safeUrl = escapeHtml(photoUrl);
    return `<span class="avatar avatar-${size}" style="width:${dim}px;height:${dim}px"><img src="${safeUrl}" alt="${safeAlt}" loading="lazy"/></span>`;
  }
  return `<span class="avatar avatar-${size} avatar-fallback" style="width:${dim}px;height:${dim}px;font-size:${fontSize}px">${initial}</span>`;
}

// Phase 3 — non-member circle preview.
function renderCirclePreview({ subject, connections }) {
  const subjectName = (subject && subject.displayName) || "A member";
  const safeName = escapeHtml(subjectName);
  const subjectAvatar = avatarHtml({
    photoUrl: subject && subject.photoUrl,
    displayName: subjectName,
    size: "lg",
  });
  const namesHtml = connections.length
    ? connections
        .map(
          (c) =>
            `<li>${avatarHtml({ photoUrl: c.photoUrl, displayName: c.displayName, size: "sm" })}<span>${escapeHtml(c.displayName || "A member")}</span></li>`,
        )
        .join("")
    : `<li class="quiet">A quiet circle, for now.</li>`;

  // No countdown shown — per spec, scarcity lives in the gesture, not
  // the chrome. The window closes silently when the cookie lapses.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Circuit — ${safeName}'s circle</title>
<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  html,body{height:100%}
  body{background:#000;color:#fff;font-family:"Inter","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .page{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;padding:24px}
  nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:48px}
  .wordmark{font-family:"SF Mono","JetBrains Mono","Fira Code",monospace;font-size:18px;font-weight:600;letter-spacing:-0.02em}
  main{flex:1;max-width:640px;margin:0 auto;width:100%}
  .label{font-family:"SF Mono","JetBrains Mono",monospace;font-size:11px;font-weight:600;letter-spacing:0.16em;color:#FF4400;margin-bottom:12px}
  h1{font-family:"Inter","Helvetica Neue",sans-serif;font-size:clamp(28px,5vw,40px);font-weight:500;line-height:1.15;letter-spacing:-0.02em;margin-bottom:32px}
  .preamble{font-size:14px;color:#A0A0A0;margin-bottom:32px;line-height:1.6}
  ul.circle{list-style:none;padding:0;margin:0 0 48px;border-top:1px solid #1a1a1a}
  ul.circle li{padding:12px 0;font-size:18px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:14px}
  ul.circle li.quiet{color:#666;font-size:14px;display:block}
  .avatar{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;overflow:hidden;background:#1a1a1a;flex-shrink:0}
  .avatar img{width:100%;height:100%;object-fit:cover;display:block}
  .avatar-fallback{font-family:"SF Mono","JetBrains Mono",monospace;font-weight:600;color:#A0A0A0;background:#0F0F0F;border:1px solid #1a1a1a}
  .subject-row{display:flex;align-items:center;gap:18px;margin-bottom:32px}
  .cta{display:inline-block;background:#FF4400;color:#000;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:2px;font-size:14px;letter-spacing:0.02em}
  footer{font-size:12px;color:#A0A0A0;margin-top:48px}
  footer a{color:#A0A0A0;text-decoration:underline}
</style>
</head>
<body>
<div class="page">
<nav><span class="wordmark">Circuit</span></nav>
<main>
<div class="subject-row">${subjectAvatar}<div><p class="label" style="margin-bottom:4px">${safeName.toUpperCase()}'S CIRCLE</p><p class="preamble" style="margin:0;font-size:13px">For 24 hours. After that the window closes.</p></div></div>
<h1>You're seeing who's in the room.</h1>
<ul class="circle">${namesHtml}</ul>
<a class="cta" href="/?v=${encodeURIComponent(safeName)}">Get on the list →</a>
</main>
<footer><a href="https://circuit.fm">circuit.fm</a><a href="https://circuit.fm/privacy">Privacy</a><a href="https://circuit.fm/terms">Terms</a></footer>
</div>
</body>
</html>`;
}

function renderCircleLapsed({ subjectName }) {
  const safeName = escapeHtml(subjectName || "A member");
  return wrapPage(`
<h1>The window closed.</h1>
<p class="strapline">You had 24 hours to see ${safeName}'s circle. To stay inside the network, you have to be in it. Get on the list — Circuit is invite-only.</p>
<a class="cta" href="/">Get on the list →</a>`);
}

// Cookie helpers — encode `firstViewAt` (epoch ms) into the cookie.
function readPreviewCookie(req, memberCode) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return null;
  const cookies = raw.split(";").map((s) => s.trim());
  const name = `circle_window_${memberCode}=`;
  const found = cookies.find((c) => c.startsWith(name));
  if (!found) return null;
  const value = found.slice(name.length);
  const ts = parseInt(value, 10);
  return Number.isFinite(ts) ? ts : null;
}

function setPreviewCookie(res, memberCode, firstViewAt) {
  const maxAge = Math.floor(CIRCLE_PREVIEW_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `circle_window_${memberCode}=${firstViewAt}; Path=/c/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
  );
}

async function fetchCirclePreview(memberCode) {
  const url = `${CIRCUIT_API_BASE}/api/circles/preview/${encodeURIComponent(memberCode)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (response.status === 410) return { gone: true };
  if (!response.ok) return { error: true };
  const body = await response.json();
  return {
    subject: body.data && body.data.subject,
    connections: (body.data && body.data.connections) || [],
  };
}

function createHandler({ db }) {
  return async function handler(req, res) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    // HEAD must mirror GET (status + headers, empty body) so link previewers
    // (Slack, iMessage, Telegram) and uptime monitors don't see 405. Skip the
    // Firestore lookups on HEAD — there's no body to render and previewer
    // unfurls don't need card-status-level fidelity (the actual GET returns
    // the right status when the user clicks).
    const isHead = req.method === "HEAD";
    if (req.method !== "GET" && !isHead) {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).send(renderNotFound());
    }

    const chipUid = req.query && req.query.chipUid;
    if (!chipUid || typeof chipUid !== "string") {
      if (isHead) {
        res.status(400);
        return res.end();
      }
      return res.status(400).send(renderNotFound());
    }

    if (isHead) {
      res.status(200);
      return res.end();
    }

    // Phase 3 dispatch — `mbr_*`-prefixed codes are member codes from
    // meetcircuit.com, not Firestore card UUIDs. Fetch from the
    // Circle preview endpoint and render the 24-hour names list.
    if (chipUid.startsWith("mbr_")) {
      try {
        const result = await fetchCirclePreview(chipUid);
        if (result.gone) {
          return res.status(410).send(renderGone());
        }
        if (result.error) {
          return res.status(500).send(renderError());
        }
        const subject = result.subject || {
          displayName: "A Circuit member",
          photoUrl: null,
        };
        const subjectName = subject.displayName || "A Circuit member";

        // 24-hour cookie window: first view sets the timestamp, later
        // views check it. After 24h the user sees the lapse view.
        const firstViewAt = readPreviewCookie(req, chipUid);
        const now = Date.now();
        if (firstViewAt && now - firstViewAt > CIRCLE_PREVIEW_TTL_MS) {
          return res.status(200).send(renderCircleLapsed({ subjectName }));
        }
        if (!firstViewAt) {
          setPreviewCookie(res, chipUid, now);
        }
        return res.status(200).send(
          renderCirclePreview({
            subject,
            connections: result.connections,
          }),
        );
      } catch (err) {
        console.error("Phase 3 circle preview error:", err);
        return res.status(500).send(renderError());
      }
    }

    try {
      const cardSnap = await db.collection("cards").doc(chipUid).get();
      if (!cardSnap.exists) {
        return res.status(404).send(renderNotFound());
      }
      const card = cardSnap.data();

      if (card.status && card.status !== "active") {
        return res.status(410).send(renderGone());
      }

      if (!card.member_id) {
        console.error(`Card ${chipUid} has no member_id`);
        return res.status(500).send(renderError());
      }

      const memberSnap = await db
        .collection("members")
        .doc(card.member_id)
        .get();

      if (!memberSnap.exists) {
        console.error(
          `Card ${chipUid} points to missing member ${card.member_id}`,
        );
        return res.status(500).send(renderError());
      }

      const member = memberSnap.data();
      const memberName =
        typeof member.name === "string" && member.name.trim().length > 0
          ? member.name.trim()
          : "A Circuit member";

      return res.status(200).send(
        renderLanding({
          memberName,
          memberId: card.member_id,
        }),
      );
    } catch (err) {
      console.error("Tap landing error:", err);
      return res.status(500).send(renderError());
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
