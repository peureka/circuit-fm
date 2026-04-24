# 2026-04-24 — cccircuit — Culture Club Card build, session 4

**Goal**: Public leaderboard at `/board` — GET `/api/board` returns top 50 vouchers by score (resolving member names), and a static HTML page fetches and renders the ranks.

**Done**:

- `api/board.js` — GET-only handler using `createHandler({ db })` DI pattern. Reads all `vouches`, aggregates per-voucher via `lib/scoring.topN`, resolves each member's display name from `members` collection (fallback: "A Culture Club member" for missing or empty-named member docs). Default limit 50. Returns `{ entries: [{ name, score }], count, generated_at }`.
- `board.html` — static Culture Club-branded leaderboard page. Fetches `/api/board` on load, renders a numbered ordered list. Loading / empty / error states all present. Client-side HTML escapes the member name defensively.
- `vercel.json` — new rewrite `/board → /board.html` so the URL stays clean.

**Tests added** (`test/board.test.js`, 8 cases):

- GET with empty vouches → 200, `entries: []`, `count: 0`
- GET ranks members by descending score, resolves names correctly
- Default limit caps at 50 entries
- Missing member doc → fallback generic name ("A Culture Club member")
- Vouches with unknown status are excluded (scored 0 → skipped in topN)
- Response ONLY exposes `{ name, score }` per entry — no `member_id`, no email, no internal IDs
- POST → 405
- Response includes a parseable `generated_at` timestamp

50 tests green across the full suite.

**Decisions**:

- **Response shape is minimal on purpose.** `{ name, score }` — nothing else. No `member_id` (internal identifier, nobody needs it client-side and exposing it gives a lookup handle). No email (PII). No timestamps per-entry. Rank is implicit in array order.
- **Public, no auth.** Per the reconciled spec, the leaderboard is publicly visible at `cccircuit.com/board`, not member-gated. Public is the point — a screenshottable rank is marketing.
- **No pagination, no `?limit=` query param.** 50 is the cap. Simpler wire protocol, matches the reconciled spec's framing of "top of the board." If pagination becomes useful later, it's an additive change.
- **Read-all-vouches on every request.** Simple and correct at current scale. At 10k+ vouches this becomes expensive, at which point the right fix is a periodic aggregation job writing a denormalised `leaderboard` doc, not pagination. Logged to backlog.
- **No caching headers.** Each request hits Firestore. For pre-launch scale (tens to low hundreds of vouches) this is fine. Session 5's hardening pass will add basic CDN caching (e.g. `Cache-Control: public, max-age=60`) before go-live.

**Deferred to backlog**:

- **Periodic aggregation** to precompute the leaderboard — required at >1k vouches. Cron or Firebase trigger writes a `leaderboard/current` doc; board endpoint reads that instead of recomputing.
- **Caching** on `/api/board` (Vercel edge cache with short TTL). Session 5.
- **Rate limiting** on `/api/board` — public endpoint, needs basic abuse protection. Session 5.
- **Client-side JS tests** for `board.html` — no browser test runner set up.

**Smoke test** (post-deploy):

Without seeded vouches the page shows "No vouches yet" — that's the correct empty state and a valid smoke. For end-to-end:

1. Seed: `members/m1 { name: "Test Ada" }`, `members/m2 { name: "Test Grace" }` and two vouches:
   - `vouches/m1__test1@x.com { from_member_id: "m1", recipient_email: "test1@x.com", status: "tapped" }`
   - `vouches/m2__test2@x.com { from_member_id: "m2", recipient_email: "test2@x.com", status: "voucher" }`
2. Visit `https://cccircuit.com/board` — should render "01 Test Grace 14" then "02 Test Ada 1".
3. Hit `https://cccircuit.com/api/board` directly — JSON with the same ordering.
4. Clean up all 4 docs via Firebase console.

**Next**: Session 5 — admin card provisioning + hardening pass. Extend `admin.html` and add `api/provision-card.js` (admin-authed) so the curator can batch-assign chip UIDs to members. Also: rate-limit the public endpoints (`/api/c/<chipUid>`, `/api/board`), add basic input-abuse guards, and add `Cache-Control` on `/api/board`. This is the gate before the 20 May London LINECONIC go-live.
