# Culture Club Build Brief — Card + Leaderboard Viral Loop

Implementation plan for the Card + Board mechanic defined in the reconciled spec. Targets the 20 May 2026 London LINECONIC show for first live use.

## Canonical specs

- `docs/CULTURE_CLUB_VISION_V2.md` (this repo) — membership model and the "Card and the Board" section
- `avdience-docs/docs/culture-club/CULTURE_CLUB_CARD.md` — physical card + tap spec
- `avdience-docs/docs/culture-club/RECONCILIATION.md` — decision record

**Governing principle:** *Attendance gates intimacy. Rank gates exposure.* See the reconciliation for the eight decisions this encodes.

## Discipline

- **TDD** per `Code/CLAUDE.md`. Every handler is refactored to accept `{ db, resend, ... }` dependency injection so tests can run with fakes. See `test/helpers/`.
- **No spike mode.** Every session starts with a failing test and ends with the test passing + the full suite green.
- **Each session is self-contained.** Red → green → refactor → session log → commit. No "while I'm here" changes — add them to `docs/backlog.md`.

## Stack constraints

- Firebase Firestore + Vercel serverless functions + static HTML/JS. No Next.js, no React, no Prisma.
- Tests use Node's built-in `node:test` runner. Firestore and Resend are mocked via `test/helpers/`.
- Public endpoints (`/api/c/[chipUid]`, `/api/vouch`, `/board` aggregation) need basic rate-limiting and validation before going live — handled in Session 5.
- Admin endpoints stay behind `BROADCAST_SECRET` bearer auth (existing pattern).

## Sessions

### Session 1 — Schema + join form upgrade (this session)

**Scope:** extend the existing signup flow to capture a name alongside the email. Do NOT introduce `members`, `cards`, or `vouches` collections yet — those come in sessions that actually use them.

- Red: tests for `api/signup.js` accepting `{ email, name }` and rejecting invalid inputs.
- Green: refactor `api/signup.js` with dependency injection; accept and store `name` in the `signups` Firestore doc.
- `index.html` form captures `name`.
- `firestore.rules` updated to allow the optional `name` field on `signups` docs.

### Session 2 — Tap landing route

- Red: tests for `api/c/[chipUid].js` resolving a chip → member, returning an HTML page.
- Green: `members` and `cards` Firestore collections + rules. Route renders "{member_name} thinks you belong in Culture Club" with a CTA to the join form.
- UUIDs on chips; no HMAC/SUN — Culture Club invites are disposable and don't need replay protection.

### Session 3 — Vouch tracking + scoring

- Red: tests for `api/vouch.js` creating a `vouches` row when a tap-landing recipient submits the join form; tests for the scoring aggregation.
- Green: `vouches` collection + rules. `lib/scoring.js` computes +1 / +3 / +10 per vouch.

### Session 4 — Public leaderboard

- Red: tests for `api/board.js` returning top N vouchers with scores.
- Green: implement `api/board.js`. Add `/board` route fetching and rendering the top 50. Publicly visible — no auth.

### Session 5 — Admin card provisioning + hardening

- Red: tests for admin provisioning flow (upload chip UIDs → create `cards` docs, link to member at first handover).
- Green: extend `admin.html` with provisioning action + `api/provision-card.js` (admin-authed).
- Harden public endpoints: rate limits, input validation, abuse protection. Required before going live 20 May.

## Physical (not code)

- Order 50 printed NFC cards (CR80, matte black, orange ring, NTAG 215). ~£150 from Seritag or equivalent UK NFC printer. 5–10 day lead time — order immediately.
- Program chip URLs (`cccircuit.com/c/{uuid}`) via NFC Tools app after cards arrive. ~1 hour for 50 cards.

## First live run

**20 May 2026 — LINECONIC London.** Ciara brings the tin of cards, hands one to each first-time attendee at check-in.

## Backlog (defer to future sessions)

- Mobile-responsive form layout with two inputs (name + email)
- Member login / self-service rank view
- Abuse detection on the leaderboard (flag suspicious vouch patterns)
- Firebase emulator integration for deeper tests than the in-memory fake supports
