# 2026-04-24 — cccircuit — Culture Club Card build, session 2

**Goal**: Ship the tap landing route at `/c/<chipUid>` that resolves an NFC card to its voucher member and renders a naming-and-CTA HTML page. Introduces the `cards` and `members` Firestore collections (schema, not data).

**Done**:
- Added `api/c/[chipUid].js` with `createHandler({ db })` factory. Resolves a chip → card → member, renders HTML naming the vouching member and linking to `/?v=<memberId>` as the join CTA. UUIDs only — no HMAC/SUN; Culture Club invites are disposable.
- HTML rendering is inline in the handler (small landing page, matches Culture Club brand: black background, orange accent, mono font, Inter headline). Uses `escapeHtml` from `lib/templates.js` (newly exported).
- Five response paths:
  - 200 with landing HTML (valid active card, valid member)
  - 404 with "card not recognised" HTML (unknown chipUid or missing chipUid)
  - 410 with "card no longer active" HTML (card status lost/disabled)
  - 500 with generic error HTML (card → missing member data integrity issue; unexpected errors)
  - 405 (non-GET methods)
- `vercel.json` rewrite added: `/c/:chipUid → /api/c/:chipUid` so the NFC chips can encode clean URLs.
- `lib/templates.js` now exports `escapeHtml` alongside the email renderers.
- `test/helpers/fakeRes.js` extended with `send()` and `setHeader()` to support HTML responses.

**Tests added** (`test/chip-landing.test.js`, 9 cases):
- Valid active card → 200 + HTML containing member name + CTA with `?v=<memberId>`
- Unknown chipUid → 404 HTML
- Card status `lost` → 410
- Card status `disabled` → 410
- Card pointing to missing member doc → 500 (data integrity)
- POST → 405
- Missing chipUid query param → 400
- XSS: member name with HTML-special chars is escaped, no live script tag
- Member without a name falls back to "A Culture Club member" label

All 22 tests green across the suite (13 signup + 9 chip-landing + 3 helper no-op entries from node:test discovery).

**Decisions**:
- Used UUIDs on chips with no cryptographic signing. Culture Club invites are disposable; if a chipUid leaks, the worst case is someone lands on a join page crediting a legitimate member — low-severity compared to Circuit Block check-in spoofing (where replay protection is essential).
- HTML rendered inline in the handler rather than extracted to a template module. Small page, single-use, favouring locality of reference over DRY at this scale.
- Firestore rules UNCHANGED. The existing catch-all `match /{document=**} { allow read, write: if false }` denies all client access to `cards` and `members` — everything goes through admin SDK which bypasses rules. Adding explicit collection-level rules would be no-ops. When Session 4 introduces the public `/board` reader (if it reads Firestore client-side), rules will need specific additions at that point.
- CTA link uses `/?v=<memberId>` — this is a forward-compatible attribution hook. The signup flow in Session 1 doesn't yet read `?v`, and session 1 tests don't expect it. Session 3 will wire the signup flow to capture `v` and create a `vouches` doc linking recipient ↔ voucher.
- Rendered 410 page rather than 404 for lost/disabled cards because the card is a real past credential, not an unknown identifier — treating it as gone is semantically cleaner and gives better signal in logs.

**Deferred to backlog**:
- Update `last_tap_at` on the card doc when it's resolved. Adds write-side-effect to a read-path; worth doing for analytics but out of scope here.
- Analytics on tap-landing conversions (did the recipient click the CTA? did they sign up via `?v`?) — Session 3 will cover the conversion side; Session 4 or later could add the tap-to-CTA click tracking.
- Session 1 backlog items (mobile-responsive form layout, emulator-based tests) still outstanding.

**Smoke test** (not run this session — documented for post-deploy):

No real card/member data exists in production yet — provisioning lives in Session 5. A full smoke requires a seeded card. The partial smokes you can run immediately after deploy:

1. Hit `https://cccircuit.com/c/any-random-string` → should render the 404 "card not recognised" HTML.
2. Curl the same URL with `-I` → should return `200 OK` on the HTML body with `Content-Type: text/html; charset=utf-8` and the response body should match the 404 HTML template.

Actually — a smart partial smoke: once the prod deploy is live, you can manually write one `cards` doc + one `members` doc via the Firebase console (or a throwaway admin script), hit `/c/<thatChipUid>`, verify the 200 landing page, then delete both docs. That gives you full end-to-end verification without waiting for Session 5.

**Next**: Session 3 — vouch tracking. Add `vouches` Firestore collection. Signup flow reads `?v=<memberId>` from the landing URL, creates a `vouches` doc linking recipient-email ↔ voucher-member. `lib/scoring.js` computes +1 / +3 / +10 aggregates. Tests for each path.
