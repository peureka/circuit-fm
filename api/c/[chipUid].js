// Tap landing route. A Circuit FM member's card's NFC chip emits
// https://circuit.fm/c/<chipUid>. When a friend taps their phone, we:
//   1. resolve the chip → member via the `cards` and `members` collections
//   2. render a landing page naming the vouching member + CTA to join
// UUIDs on chips, no HMAC — Circuit FM invites are disposable credentials.

const admin = require("firebase-admin");
const { escapeHtml } = require("../../lib/templates");

function wrapPage(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Circuit FM</title>
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
  footer{font-size:12px;color:#A0A0A0}
  footer a{color:#A0A0A0;text-decoration:underline}
</style>
</head>
<body>
<div class="page">
<nav><span class="wordmark">Circuit FM</span></nav>
<main>${body}</main>
</div>
</body>
</html>`;
}

function renderLanding({ memberName, memberId }) {
  const safeName = escapeHtml(memberName);
  const safeId = encodeURIComponent(memberId);
  return wrapPage(`
<h1>${safeName} thinks you belong in Circuit FM.</h1>
<p class="strapline">A members' club with no house. It moves with you.</p>
<a class="cta" href="/?v=${safeId}">Get on the list →</a>`);
}

function renderNotFound() {
  return wrapPage(`
<h1>Card not recognised.</h1>
<p class="strapline">This card isn't active in Circuit FM. If you think that's wrong, ask the person who gave it to you to check with the curator.</p>
<a class="cta" href="/">Back to Circuit FM →</a>`);
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
          : "A Circuit FM member";

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
