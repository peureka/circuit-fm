# 2026-04-24 — cccircuit — Culture Club Card build, session 5

**Goal**: Ship the at-the-door card-assignment flow for May 20 go-live, and harden the public endpoints with input caps + edge caching. Final session in the build.

**Done**:

- `api/assign-card.js` — admin-authed endpoint (Bearer `BROADCAST_SECRET`). POST `{ chipUid, email, name? }` creates a `members` doc with a generated UUID, sets the `cards/<chipUid>` doc to `{ member_id, status: "active", issued_at }`, and upserts `signups/<email>` with a `member_id` backreference. Rejects 409 on already-assigned chip or already-member email. Resolves name from existing signup if not provided, 400 if neither available.
- `api/signup.js` — added length caps: email max 100, name max 100. Mirrors the Firestore schema rule since the admin SDK bypasses rules.
- `api/vouch.js` — added length caps: voucher_id max 128, email max 100.
- `api/board.js` — added `Cache-Control: public, s-maxage=60, stale-while-revalidate=30`. Vercel edge absorbs traffic spikes against the leaderboard; a newly accepted vouch shows up within 60s which is fine for a marketing surface.
- `admin.html` — new "Cards" tab with a simple assign form (chipUid + email + optional name) and a success/error status line. Wired to `POST /api/assign-card` using the existing Bearer-token admin pattern.

**Tests added** (all green, 66 total):

- `test/assign-card.test.js` — 11 cases:
  - Happy path writes member + card + signup backreference
  - 401 on missing / wrong auth
  - 400 on missing chipUid, invalid email, no-name-and-no-signup
  - 409 on chip already assigned (different member)
  - 409 on email that already has a member
  - Signup name is used when request omits name
  - 405 on GET
  - Email lowercase normalisation end-to-end
- `test/signup.test.js` — 2 cases for email/name length caps
- `test/vouch.test.js` — 2 cases for voucher_id / email length caps
- `test/board.test.js` — 1 case for `Cache-Control` header

**Decisions**:

- **No separate bulk "provision-card" endpoint.** Assign-card upserts the card doc on first touch — no pre-registration step. For 50 cards at the first show that's fine; if batch-programming becomes friction (e.g. 500 cards for a later event), add a bulk endpoint then. Logged to backlog.
- **Member IDs are UUIDs, not emails.** Generated via `crypto.randomUUID()`. Keeps the member's identity stable if they ever update their email. Cards reference member_id; the chip-landing handler (Session 2) looks up by member_id.
- **Chip UID max length 128.** Longer than any UUID string representation; covers custom encodings too. Prevents doc-ID-length-based DoS.
- **Name required for first-time member.** If request omits name AND no existing signup has one, assign-card returns 400. Better than storing a blank — the curator can correct on the spot.
- **Cache-Control on /api/board set to 60s public s-maxage, 30s SWR.** Stale-while-revalidate means the edge always serves quickly while a background fetch refreshes. New vouches visible on the board within ~60s — good enough for a marketing surface.
- **No real rate limiting this session.** Cccircuit runs on Vercel Functions without Upstash Redis. Proper rate limiting needs a shared store. Backlog.

**Deferred to backlog**:

- **Rate limiting** on `/api/signup`, `/api/vouch`, `/api/c/<chipUid>`, `/api/board`. Requires Upstash Redis integration or similar distributed store. Unnecessary for May-20 scale (50 members, low traffic), critical if scale grows.
- **Bulk provision-card** endpoint for batch-registering chipUids ahead of an event. Current assign-card handles the per-member flow fine.
- **Admin stock view** (unassigned / active / lost counts). Current UI is blind to card inventory.
- **Card lifecycle:** status transitions to "lost"/"disabled" and re-issuing a lost card. The chip-landing handler (Session 2) already 410s on non-active cards; no admin UI for marking cards yet.
- **Member status transitions** (`tapped` → `floor` → `voucher` in the vouches collection). The admin flow doesn't touch vouch status yet; recipients stay at `tapped` forever until wired up. Fine for the launch window — the +3 / +10 tiers only matter once vouchers start attending.
- **Edge caching for `/api/c/<chipUid>`** — should be cacheable too. Deferred.

**Smoke test** (post-deploy, uses real admin secret):

1. Via admin.html: unlock with BROADCAST_SECRET. Open the "Cards" tab.
2. Enter `test-smoke-001` as chipUid, `smoke-test@cccircuit.test` as email, `Session 5 Smoke` as name. Click assign.
3. Expect success status: "assigned smoke-test@cccircuit.test → <uuid>".
4. Verify in Firestore: new `members/<uuid>` doc, new `cards/test-smoke-001` doc with status "active", `signups/smoke-test@cccircuit.test` with member_id.
5. Visit `https://cccircuit.com/c/test-smoke-001` — should render the "Session 5 Smoke thinks you belong" landing page.
6. Visit `https://cccircuit.com/board` — smoke member should NOT appear (no vouches from them yet; zero score).
7. Clean up: delete all three docs from Firestore console.

**The build is done.** Sessions 1–5 shipped the full Card + leaderboard loop. What's live:

- `/api/signup` captures name + email into the Queue (+ fires confirmation email via Resend)
- `/c/<chipUid>` renders the tap-landing page when a card's in hand
- `/api/vouch` records attribution when a tapped friend signs up
- `/board` + `/api/board` show the public leaderboard
- `/admin` → Cards tab assigns a card to a member at the door

**Remaining for go-live (non-code):**

- Order 50 physical cards (~£150, 5–10 day lead time) — order immediately.
- Program chip URLs (`cccircuit.com/c/<uuid>`) via NFC Tools app when cards arrive.
- Brief Ciara on the admin.html flow.
- 20 May London LINECONIC — first live run with Circuit Block at door + Culture Club Cards handed at check-in.
