# 2026-04-26 — cccircuit — Circuit FM rebrand

**Goal**: Rename Culture Club → Circuit FM and cccircuit.com → circuit.fm across all customer-facing surfaces, with new positioning ("A members' club with no house. It moves with you.").

**Done**:
- `index.html` — full rebrand: title/meta/OG/canonical to circuit.fm; favicon `CC` → `C`; hero restructured to mono brand + sans subline + supporting line; rotating-pill mechanic removed (CSS, items array, setInterval); CTA `Join the club →` → `Get on the list →`; one-field form (name input dropped); below-form line `Curated outings. Member-only access. Launching London 2026.`; meetcircuit.com footer link removed; about overlay rewritten; Instagram handle `cccircuit` → `circuit.fm`; body font default `mono` → `sans`, `mono` reserved for `.wordmark` / `.brand` / `.brand-mark`; `text-transform: lowercase` removed so brand renders as `Circuit FM`.
- `api/c/[chipUid].js` — chip-tap landing: title, wordmark, body copy, fallback string `A Culture Club member` → `A Circuit FM member`, header comments, removed meetcircuit footer, body font swap to sans (mono only on wordmark).
- `lib/templates.js` — confirmation email wordmark + body copy aligned with new positioning; `Powered by Circuit (meetcircuit.com)` footer → `circuit.fm` self-link.
- `board.html` — title/meta/OG/canonical → circuit.fm; favicon CC→C; wordmark, subtitle, footer link.
- `admin.html` — title, h1, favicon, CSV export filename `cccircuit-contacts-*` → `circuit-fm-contacts-*`.
- `api/cards.js`, `api/board.js` — `FALLBACK_*` constants.
- `api/signup.js`, `api/broadcast.js`, `api/contacts.js` — `RESEND_FROM` env defaults.
- `scripts/seed-venues.js` — comment + `BASE_URL_DEFAULT` `cccircuit.com` → `circuit.fm`.
- `lib/scoring.js`, `api/attendance.js`, `api/webhooks/circuit-checkin.js`, `api/assign-card.js` — header comments.
- Tests — `test/chip-landing.test.js`, `test/cards.test.js`, `test/board.test.js`: updated assertions from `Culture Club member` / `thinks you belong in Culture Club` → Circuit FM equivalents (TDD: red first, then green).

**Tests added**: none new. Updated 4 assertions in 3 existing test files. Full suite: 122/122 passing.

**Deferred to backlog**:
- `og.png` — image content still says "Culture Club"; URL switched to circuit.fm but the image asset itself wasn't regenerated.
- `docs/*` — historical session logs and vision docs still reference Culture Club; intentionally untouched.
- `package.json` name `cccircuit` + GitHub repo URL `peureka/cccircuit` — npm/repo identifiers, separate from brand.
- `docs/CULTURE_CLUB_VISION_V2.md` — historical doc, retained as-is.
- No automated test coverage for `index.html` — verified via post-edit grep + manual smoke test only. Adding a jsdom harness would be scope creep.

**Decisions**:
- Scope expanded from "landing page only" to "all customer-facing surfaces" mid-session (with explicit re-scope from PJ via "wrap up the backlog stuff too"). Internal admin page included for consistency since the operator sees the brand.
- Instagram handle migrated to `instagram.com/circuit.fm` (period is valid in IG usernames).
- One-field form: dropped name input. `api/signup.js` already treated `name` as optional, so no backend change required.
- Removed `text-transform: lowercase` on hero/about — brand "Circuit FM" needs mixed case, not `circuit fm`.
- Removed footer `Powered by Circuit / meetcircuit.com` link — per brief: "this IS Circuit now". Replaced with `circuit.fm` self-link in email templates; removed entirely from index.html.
- Skipped TDD for `index.html` (no harness exists, adding one is scope creep). Smoke tested via grep + visual inspection. Flagged in §12 spirit.

**Next**: Manual browser smoke test of index.html (golden path: load → reveal form → submit email → success state). Regenerate og.png with new branding when there's time.
