# 2026-04-27 — circuitfm-web — list management end-to-end

**Goal**: Move circuit.fm signups from a flat email list into Circuit's segmentable audience model, with a profile-completion flow + operator-side broadcast tooling.

## Done

- **Signup wiring** (`api/signup.js` + new `lib/circuit-client.js`): after Firestore + Resend, `POST` to Circuit's `/api/organiser/v1/audience/upsert`. Persist returned `profileUrl` on the Firestore signups doc and pass it to `renderConfirmation`. Failure-tolerant — Circuit outage doesn't fail signup or block confirmation email.
- **Confirmation email CTA** (`lib/templates.js`): `renderConfirmation({ profileUrl })` adds a "Tell us a bit about you →" button below the existing copy when a URL is supplied.
- **Profile form on circuit.fm** (`api/u/[token].js` + `api/u/save.js`): subscriber-facing form moved from meetcircuit.com to circuit.fm so it inherits the consumer brand. Pure progressive enhancement (no client JS); native checkboxes styled as chips via peer-checked. Toast notification (slides up, holds, fades) replaces the previous static banner.
- **Save proxy** (`api/u/save.js`): server-side input validation, consent gate, chip-value allowlist filtering, then calls Circuit's `POST /api/organiser/v1/audience/profile`. The org-side bearer token never leaves the server.
- **Vercel rewrite** for `/u/:token` → `/api/u/:token`.
- **Backfill script** (`scripts/backfill-signups-to-circuit.js`) — moot in practice (we have 2 signups, both PJ's), but built and tested for future use.
- **Pre-existing `chip-landing` test fix** — hardcoded `/Users/roch/Code/cccircuit/...` path leftover from rebrand. One-line fix.
- **`.gitignore`** — added `.DS_Store`.
- **Vercel env vars** — set `CIRCUIT_BASE_URL` (Production + Preview + Development) and `CIRCUIT_ORGANISER_API_TOKEN` (Production + Preview). Updated `RESEND_FROM` to `Circuit FM <hello@circuit.fm>` (PJ verified the circuit.fm domain in Resend mid-session). Bypassed a Vercel CLI 51.7.0 → 52.0.0 bug for `preview` env adds via the Vercel REST API.

## Tests added

- `test/profile-form.test.js` — 11 cases covering token validation, HTML render with brand tokens, toast/error banners, pre-fill from existing values, graceful Circuit-unreachable fallback, XSS escape on email content
- `test/profile-save.test.js` — 12 cases covering POST validation, consent enforcement, allowlist filtering, Circuit error mapping, no-client fallback
- `test/backfill-signups.test.js` — 4 cases covering happy path with profileUrl writeback, dry-run silence, --skip-completed, partial-failure-without-abort
- Extended `test/signup.test.js` with 5 cases for the Circuit integration (call, persist, render, failure-tolerance, null-dep)

154/154 across the repo at session end.

## Decisions

- **Form domain = consumer brand domain.** The `/u/[token]` form moved from `meetcircuit.com` (Circuit operator platform) to `circuit.fm` (consumer brand). The recipient signed up at circuit.fm and shouldn't see operator nav (BLOCK / FOR VENUES / PRICING) on a profile-completion form. Data still lives on Circuit; circuit.fm is just the rendering surface, calling Circuit's audience-profile API endpoints from a server-side proxy.
- **Failure-tolerant integration.** `api/signup.js` never fails because of Circuit. If Circuit is unreachable or the env var is missing, signup still returns 200, Resend confirmation still goes — just without the profile CTA. This is the rollout-safety property.
- **Token never leaves the server.** The `CIRCUIT_ORGANISER_API_TOKEN` is server-only. The browser never sees it. Form save flows through `api/u/save.js` which proxies to Circuit with the bearer.
- **Format taxonomy uses Circuit's `FormatType` enum string values** (`show`, `screening`, `salon`, `run`) so admin can join `Guest.formatPreferences` against `Event.formatType` without translation. Display labels are friendlier ("Live shows", "Salons & talks", etc.).
- **`RESEND_FROM` change.** Updated mid-session from `Culture Club <hello@cccircuit.com>` to `Circuit FM <hello@circuit.fm>` after PJ verified circuit.fm in Resend. The `cccircuit.com` sender was leftover from the pre-rebrand Culture Club name.
- **Vercel CLI bug.** Vercel CLI 51.7.0 (and 52.0.0) refuses to add env vars to "all Preview branches" non-interactively despite documenting that path. Fallback: hit the Vercel REST API directly with the auth token from `~/Library/Application Support/com.vercel.cli/auth.json`. Worked cleanly.

## Deferred to backlog

- The Resend single-segment broadcast in this repo (`api/broadcast.js` + admin Broadcasts tab) can be retired once Circuit-native broadcasts (PR #34 on circuit-test) are in regular use. New campaigns should be drafted on `meetcircuit.com/dashboard/broadcasts`, not here.
- Pre-existing dirty files in working tree (`docs/NEXT_STEPS.md`, `package-lock.json`) are PJ's pre-session changes — not my work, not committed.

## Cross-repo coordination

This session ran two Claude Code instances in parallel — one on `circuit` (meetcircuit.com), one here. Coordination was via written prompts handed between sessions. Each shipped 4–6 PRs:

- **circuit** (peureka/circuit-test): #24 audience-upsert + form, #25 audience-search API, #26 Campaign model, #27 broadcast send mechanism, #28 segmentation UI (other instance), #30 dry-run UX fix, #31 segment-filter consolidation (other instance), #32 audience-profile API for circuit.fm form (other instance), #33 cutover redirect from meetcircuit.com/u → circuit.fm/u (other instance), #34 broadcasts operator UI + cancel + privacy disclosure
- **circuitfm-web** (peureka/circuit-fm): #1 signup wiring, #2 chip-landing test fix, #4 backfill script (replaced #3 after parent squash), #5 circuit.fm profile form

## Next

The only meaningful gap is operator usage — PJ has a working broadcast pipeline but only 2 subscribers (both his). The next step is recruitment, not more code.
