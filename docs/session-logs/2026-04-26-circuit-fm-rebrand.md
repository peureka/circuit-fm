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

---

## Continuation — same day, post-rebrand polish

After the initial rebrand commit (`800b1c5`) shipped, four further commits landed in this session.

**Done (continuation)**:

1. `3fd654c` `chore(cccircuit): rename npm package + GitHub repo URLs to circuit-fm`
   - GitHub repo renamed `peureka/cccircuit` → `peureka/circuit-fm` via `gh repo rename`. GitHub auto-redirect keeps existing clones working.
   - `git remote` auto-updated by `gh`. Verified.
   - `package.json`: `name` `cccircuit` → `circuit-fm`; `repository.url`, `bugs.url`, `homepage` all repointed; added a real `description`.

2. `c0f4c04` `feat(cccircuit): swap favicon glyph from "C" letter to orange ring`
   - Replaced single-letter `C` glyph with an inline-SVG ring (`r=32 stroke=14` in 100×100 viewBox). Applied to `index.html`, `board.html`, `admin.html`.

3. `de4a1b1` `feat(cccircuit): add orange ring above hero wordmark on landing`
   - Added an inline SVG ring above `.brand` in the hero, mirroring the Circuit logo lockup (ring on top, wordmark below).
   - Sized via `clamp(72px, 13vw, 144px)`, ring proportions `r=36 stroke=8` in viewBox 100. Thinner than the favicon ring because the hero ring lives at large display size.

4. `e556afb` `feat(cccircuit): align landing with canonical Circuit FM tokens + spinning ring`
   - Adopted Circuit design tokens from `circuit/docs/DESIGN_SYSTEM.md`: surface `#000` → `#0A0A0A`; primary text `#FFF` → `#F5F5F5`; about-overlay bg matched.
   - Font stacks repointed to canonical: `--sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`; `--mono: "SF Mono", "Cascadia Code", "Fira Code", "Consolas", monospace`.
   - Hero ring: replaced static SVG with the `meetcircuit.com/fm` pattern — CSS-animated 3D spin (`rotateY` 8s linear infinite) inside a `.brand-ring-scene` with `perspective: 900px`. `prefers-reduced-motion` respected.
   - Favicon: swapped to identical SVG as `circuit/public/favicon.svg` (rounded square `rx=6`, ring `r=9 stroke=2.5` in 32×32 viewBox), with bg `#0A0A0A` to match new tokens. Applied to all three favicons.
   - Briefly tried a chunkier favicon variant for legibility; reverted in-place to canonical for cross-surface brand consistency. No commit on the chunky variant.

**Tests**: 122/122 throughout. No new tests; `index.html` remains uncovered by automated tests (still no jsdom harness — same scope-creep judgement).

**Decisions (continuation)**:
- **GitHub naming.** Chose `circuit-fm` (hyphen) over `circuit.fm` because dots are unconventional in GitHub repo names, and reversal is cheap (`gh repo rename`).
- **Folder rename deferred.** PJ asked to rename `/Users/roch/Code/cccircuit` → `/Users/roch/Code/circuitfm-web`. Did not execute — the active session has bash CWD baked in, and `mv`-ing the directory mid-session can break tool state and any IDE/terminal pointing at the old path. Safer for PJ to do it themselves between sessions.
- **Two pages, one brand.** Discovered `circuit/src/app/fm/page.tsx` is the canonical Circuit FM page (3D spinning ring, "See who's here →" tagline, links to `/request`). Decision: cccircuit (waitlist) and circuit/fm (see-who's-here flow) are different products; circuit.fm currently serves the cccircuit waitlist (per Vercel domain alias), and meetcircuit.com hosts the circuit/fm see-who's-here flow. PJ said "we just use the meetcircuit.com favicon and spinning ring" — interpreted as: port the canonical visual elements (ring + favicon) into cccircuit's landing while keeping the waitlist structure.
- **3D animation is on-brand.** My earlier "3D not now" recommendation was wrong — Circuit's canonical FM page already ships with `rotateY` animation. Course-corrected.
- **Token contradiction.** `globals.css` (the runtime in circuit) uses pure `#000` / `#fff` in dark mode; `DESIGN_SYSTEM.md` (the doc) and `fm.css` (the brand-surface override) use `#0A0A0A`. Followed PJ's explicit instruction to use `#0A0A0A`/`#F5F5F5` — aligns with the brand-surface registers, not the operational dark-mode tokens.

**Backlog (still open)**:
- `og.png` — still says "Culture Club"; regenerate.
- Local folder rename `/Users/roch/Code/cccircuit` → `/Users/roch/Code/circuitfm-web` (do between sessions).
- meetcircuit.com `/fm` → broken link to `/request` (file at `/fm/request`, not `/request`). Either move/rename OR add a top-level `/request` route OR add a Vercel rewrite. Out of scope for this repo, but flagged for circuit repo.
- Manual browser smoke of the spinning ring on mobile (no harness here).

**Next**: Folder rename (PJ), regenerate `og.png`, decide what to do with `meetcircuit.com/fm`'s broken `/request` link in a separate session inside the `circuit` repo.
