# Culture Club Card — Next Steps to May 20 Go-Live

**Last updated:** 2026-04-24 (late session)
**Target date:** 2026-05-20 (London LINECONIC, Soho House)
**Curator at the door:** Ciara

---

## Where you are right now

Build is complete, tested (122 tests), and deployed. The Culture Club ↔ Circuit integration is wired on the cccircuit side and verified with a live signed-curl smoke test against prod. What remains is physical (cards + Block) and one SQL script against Circuit's prod DB.

**What's actually running right now at cccircuit.com:**

| URL | What it does | State today |
|---|---|---|
| `cccircuit.com/` | Signup form (email + name, picks up `?v=` voucher attribution) | Working |
| `cccircuit.com/c/<chipUid>` | Tap-landing page for NFC cards | Renders 404 "card not recognised" for any chipUid — **no cards provisioned yet** |
| `cccircuit.com/board` | Public leaderboard | "No vouches yet" empty state; auto-populates once cards go out |
| `cccircuit.com/admin` | Admin panel: Dashboard, Contacts, Broadcasts, Outings, Venues, Cards | Fully upgraded — stock view, assign, provision, record attendance, pull-from-outings in broadcasts |
| `cccircuit.com/api/signup` | Queue signup endpoint | Live |
| `cccircuit.com/api/vouch` | Attribution endpoint | Live |
| `cccircuit.com/api/c/<chipUid>` | Chip resolve | Live |
| `cccircuit.com/api/board` | Public leaderboard JSON (edge-cached 60s) | Live |
| `cccircuit.com/api/assign-card` | Admin: hand a card to a member (+ auto-advances any tapped vouches → voucher) | Live |
| `cccircuit.com/api/provision-card` | Admin: bulk register chipUids as unassigned stock | Live |
| `cccircuit.com/api/cards` | Admin: list cards + stock counts (populates the Cards tab) | Live |
| `cccircuit.com/api/attendance` | Admin: record who attended an outing (auto-advances tapped vouches → floor) | Live |
| `cccircuit.com/api/webhooks/circuit-checkin` | Receives Circuit `attendance.created` webhooks | Live + smoke-tested against prod on 2026-04-24 |
| `cccircuit.com/api/assign-card`, `/outings`, `/venues`, `/contacts`, `/broadcast`, `/stats`, `/cards`, `/provision-card`, `/attendance`, `/vouch` | Admin + public routes | All live |

**Seeded:** 43 venues across Watch/Move/Eat/See + six target neighbourhoods (Circuit operator overlap flagged in notes). 15 of the 43 are Circuit-target venues.

**What is missing:** physical cards (Step 1), Block provisioning on the Circuit side (Step 4), and the one-time Circuit DB setup (Step A below).

---

## Circuit integration setup — STATUS

**Wired and live as of 2026-04-24.** The webhook plumbing is in place. What's left is creating the May 20 Event on Circuit and pasting its ID into the cccircuit outing.

### Provisioned (done — reference UUIDs)

| Piece | Value | Where |
|---|---|---|
| `CIRCUIT_WEBHOOK_SECRET` in cccircuit Vercel (Production) | stored in 1Password (64-char hex) | cccircuit Vercel project env |
| Culture Club **Organisation** | `e87b58da-6d2a-4cf8-bdc6-60c698eac541` | Circuit prod DB, `organisations` table |
| LINECONIC organiser → Culture Club **member link** | role `viewer`, relationship `owned` | Circuit prod DB, `organisation_members` table |
| **EnterpriseWebhook** subscription | `3347a0e1-aa46-454b-89dd-d45c915a42fb` | Circuit prod DB, `enterprise_webhooks` table, events=`['attendance.created']`, active=true |
| Webhook URL | `https://www.cccircuit.com/api/webhooks/circuit-checkin` | (stored in the EnterpriseWebhook row above) |
| Webhook receiver smoke test | `HTTP 200 {action: skipped_unmapped_event}` | verified against prod |

### LINECONIC organiser's existing Locations (discovered during setup)

| Location | id | City |
|---|---|---|
| **Shoreditch House** ← this is the May 20 LINECONIC venue | `07a6d12a-2662-4857-8ce2-04eb31c09b0b` | London |
| Home House | `d2a84a6c-c2e6-4b41-9821-a852fb67b391` | London |
| GoHub Studio | `b403f03f-d802-4c44-8387-da15f32539fc` | London |
| Soho House New York | `c32552a4-0bac-4b1f-90c1-60111120d38b` | New York |

(There's no Soho House Greek Street in Circuit — LINECONIC London runs at Shoreditch House.)

### Still to do (your actions)

**1. Create the May 20 Event on Circuit** — via Circuit's organiser event-creation UI:
- Organiser: LINECONIC (existing)
- Location: **Shoreditch House** (`07a6d12a-2662-4857-8ce2-04eb31c09b0b`)
- Name: `LINECONIC May 20` (or similar)
- Date: 2026-05-20
- Copy the resulting `Event.id`

**2. Link it to the cccircuit outing** — `cccircuit.com/admin` → Outings → the May 20 outing → paste `Event.id` into the `circuit_event_id` field → save.

**3. Provision a Block for Shoreditch House** — use Circuit's `scripts/provision-block.ts` with the chip UID + HMAC key from the Seritag delivery sheet. Mount at the entrance on the night.

**4. Smoke test on the May 18 dry run** — with a real chip UID of a provisioned Block at the event:

```bash
CIRCUIT_WEBHOOK_SECRET="<value-from-1password>" \
  bash /Users/roch/Documents/Code/cccircuit/scripts/smoke-circuit-webhook.sh
```

Expected: `HTTP 200` with `action: "skipped_unmapped_event"` (the smoke uses a fake event id, so unmapped is correct).

For a real end-to-end check: tap the Block with your phone at the Event. You should see:
- Attendance doc appear in cccircuit's Firestore
- Any vouches pointing at your email advance from `tapped` to `floor`
- `/board` rank update for your voucher

---

## Critical path (in order)

### Step 1 — Order 50 printed NFC cards (DO THIS WEEK)

**Why now:** 5–10 day lead time. Anything past 2026-04-28 is cutting May 20 close.

**What to order:**

- **Quantity:** 50 cards (enough for ~6 months of first-time Floor promotions at 1–2 LINECONICs per month)
- **Size:** CR80 standard (85.6mm × 54mm) — same as a credit card
- **Finish:** Matte black
- **Print:** Orange ring (International Orange, #FF4400) on front face. No name, no wordmark. Identical exterior on every card.
- **Chip:** NXP NTAG 215 (506 bytes usable; more than enough for a URL). **Not** NTAG 424 DNA — that's overkill for Culture Club (it's what Circuit Block uses for HMAC-signed check-ins; Culture Club invites are disposable).
- **Programming:** Order blank or unprogrammed. You will write the URLs yourself with NFC Tools (see Step 2).

**Where to order:**

- **Seritag** (UK, mail@seritag.com) — what Circuit Block uses, so you already know them. ~£3/unit at this volume, plus printing.
- Or any UK NFC card printer — just quote "CR80 NTAG 215, matte black, single orange ring print, 50 units."

**Budget:** ~£150. Can go up to £200 depending on printing fees.

**Shipping:** to your address. They'll arrive blank (chips present but no data written).

---

### Step 2 — Program chip URLs when cards arrive (~1 hour)

**Why:** Each chip needs to emit `cccircuit.com/c/<uuid>` when tapped. Until this is done, the cards are inert.

**What you need:**

- An iPhone or Android with **NFC Tools** app installed (free, App Store / Play Store)
- The 50 blank cards
- 50 UUIDs (generate before you start)

**Generate 50 UUIDs:** Run this in your terminal:

```
for i in {1..50}; do uuidgen | tr '[:upper:]' '[:lower:]'; done > ~/Desktop/cc-card-uuids.txt
```

You now have 50 unique UUIDs in a text file. Each line will become one card's URL.

**Programming each card** (repeat 50 times):

1. Open NFC Tools → Write → Add a record → URL/URI
2. Enter `https://cccircuit.com/c/<uuid>` — paste one UUID from your file
3. Tap "OK"
4. Tap "Write" (button at bottom)
5. Hold the blank card against the phone's NFC antenna area (top of iPhone, back of most Androids)
6. Wait for "Done" — takes ~2 seconds
7. Mark off that UUID on your list (or move to a separate "done" column)
8. Next card, next UUID

**Tip:** Do this in front of the TV. Don't rush — a bad write is fine to re-do but takes time to notice. Test every 10th card by tapping it to make sure the URL opens correctly.

**After programming:** keep the UUID list somewhere safe. You'll need it in Step 3.

---

### Step 3 — Brief Ciara on the admin flow (30 min, in person)

**Why:** Ciara is the curator in London. She'll carry the tin of 50 cards and hand them out at LINECONIC. She needs to know:

- Which members get a card (first-timers only — Floor tier)
- How to use `cccircuit.com/admin` → Cards tab
- What to do if something goes wrong

**The conversation:**

1. **Who gets a card:** every first-time LINECONIC attendee who's passed The List (Ciara's street interview) or signed up via `cccircuit.com`. Not returning attendees — they already have theirs.

2. **How to assign:** at the door, after you've given them their card:
   - Open `cccircuit.com/admin` on your phone
   - Enter the BROADCAST_SECRET (you have this, or ask PJ)
   - Tap "Cards" tab
   - Scan the card you just handed over with NFC Tools to read its UUID — **or** (simpler) ask the member for their email first, assign their card afterwards; you'll have a printed sheet with the card UUIDs and can mark them off as you assign.
   - Type chipUid, email, name. Hit "assign". Expect a green success message.

3. **If they've already signed up:** the member's name will be on file already; the admin form still needs their email, and you can leave name blank (it uses the signup name).

4. **If they haven't signed up:** just type their email + name. The system creates both the signup and the member record.

5. **If the system errors:**
   - "Email already has a card" — they're already a member. Don't re-assign.
   - "Card already assigned" — you picked a card UUID that's already been given out. Grab a fresh card.
   - "Network error" — Soho House wifi. Step outside, try again. The database doesn't care when you assign; you can assign retroactively the next day if needed.

6. **At the end of the night:** sync with PJ. Share which cards went out and to whom. Cross-check the admin panel to make sure all assignments landed.

---

### Step 4 — Dry run (weekend before May 20)

**Why:** catch anything that breaks in the real flow before the live show.

**What to do:**

1. **Program one test card.** Use a UUID ending in `smoke-test` or similar recognisable.
2. **Assign it** to yourself via `cccircuit.com/admin` — use a test email (e.g. `peterjroch+smoke@gmail.com`).
3. **Tap the test card** with a second phone (not the one you used to program it — that one still has the URL in its clipboard). Expect the "<your name> thinks you belong" landing page.
4. **Click "Join the queue →"** — arrives at `cccircuit.com/?v=<your-member-id>`.
5. **Sign up** with a fresh test email (e.g. `peterjroch+recipient@gmail.com`). Both calls should fire — signup and vouch.
6. **Visit `cccircuit.com/board`** — you should see yourself at rank 1 with score 1.
7. **Clean up:** delete the test `signups`, `members`, `cards`, `vouches` docs from the Firebase console.

If any step doesn't work, fix it before the live show. This is the last cheap moment to catch bugs.

---

### Step 5 — Go live — May 20 London LINECONIC

**The night itself:**

- Ciara arrives with the tin of cards + a printed list of card UUIDs
- PJ brings Circuit Block on the tripod for the door (separate Circuit infrastructure, separate company — but it captures attendance for every Culture Club member)
- First-time attendees get handed a Culture Club Card as they're checked in
- Ciara assigns each one in admin.html in real time (or batches at the end — the flow tolerates both)
- Card recipients are told, once: **"tap this on a friend's phone to vouch them in."** No other explanation.
- At the end of the night, sync in WhatsApp or email with the card UUIDs handed out and to whom

**What "success" looks like on the night:**

- Every first-timer leaves with a card they can hand out
- The admin panel shows N members added (N = first-timers)
- The Block at the door has N taps (= attendance)
- Within the next ~48 hours, at least one card tap comes in (someone hands their card to a friend who signs up)

**What a "bad night" looks like:**

- Cards handed out but admin assignments never landed (network issue at venue)
- Admin panel shows mismatched member count vs attendance
- A week later, no card-tap signups → either cards aren't being handed out, or the recipients aren't converting

---

## Not blocking launch (backlog — can be done any time after)

| Item | Why not now |
|---|---|
| Bulk provision-card endpoint | Per-member assignment works fine at 50-card scale. Add if volume grows. |
| Admin "card inventory" view (N unassigned, N active, N lost) | Nice-to-have; a printed sheet does the same job at launch. |
| Rate limiting on public endpoints | Needs Upstash Redis integration. Scale is tiny pre-launch; spam unlikely. Add if abuse shows up. |
| Vouch status transitions (tapped → floor → voucher) | Scoring module handles all three, but admin UI only writes `tapped`. Once first recipients start attending their own first outings, this becomes worth wiring. |
| Lost / disabled card flow | Chip-landing 410s on non-active cards, but there's no admin UI to mark a card lost. Lost-card flow: manually set `cards/<chipUid>.status = "disabled"` in Firebase console for now. |
| Edge caching on `/api/c/<chipUid>` | /api/board is cached; chip-landing isn't. No urgency at launch scale. |
| Client-side / browser tests | No Playwright/Cypress yet. Node:test covers handlers only. |
| Firebase emulator tests | In-memory fake covers the path; emulator would add integration confidence. |

See `docs/BUILD_BRIEF.md` for the original plan and `docs/session-logs/2026-04-24-cc-card-session-*.md` for what shipped per session.

---

## Automated follow-ups

**May 8 audit agent** (already scheduled via `/schedule`) — an agent will check at ~10:00 UTC on 2026-05-08 whether the build has drifted from the reconciled spec. If drift detected, it emails `peterjroch@gmail.com` with a diff. If no drift and no new commits, it reports "no build activity" and stands down.

**Consider adding:** a May 18 reminder agent to prompt the dry run. Run `/schedule` if you want one.

---

## Where everything lives

**This repo (`cccircuit`):**

```
api/
  assign-card.js            Admin: hand a card to a member (session 5)
  board.js                  Public leaderboard JSON, edge-cached (session 4)
  c/[chipUid].js            Tap landing page (session 2)
  signup.js                 Queue signup endpoint (session 1)
  vouch.js                  Vouch attribution endpoint (refactor)
  broadcast.js, contacts.js, outings.js, stats.js, venues.js, signup.js, broadcast-history.js, preview.js
                            Pre-existing admin email / events infrastructure
lib/
  scoring.js                Cumulative leaderboard math (+1/+4/+14)
  templates.js              Email + HTML render helpers
test/
  assign-card.test.js, board.test.js, chip-landing.test.js, scoring.test.js, signup.test.js, vouch.test.js
  helpers/                  In-memory Firestore + Resend + Response fakes
board.html                  Public leaderboard page
admin.html                  Admin panel (Cards tab added session 5)
index.html                  Landing page (with name field as of session 1)
docs/
  BUILD_BRIEF.md            The 5-session plan (this file's parent document)
  CULTURE_CLUB_VISION_V2.md Full Culture Club spec (v2 + Card/Board section)
  NEXT_STEPS.md             This file
  session-logs/             One log per completed session
firestore.rules             Firestore security rules (session 1 + catch-all for new collections)
vercel.json                 Rewrites: /admin, /board, /c/<chipUid>
```

**Companion spec (in `avdience-docs`):**

- `docs/culture-club/CULTURE_CLUB_CARD.md` — physical card + tap spec (reconciled)
- `docs/culture-club/VIRAL_LOOP_THESIS.md` — why this loop shape
- `docs/culture-club/THE_LIST_FOR_CULTURE_CLUB.md` — Ciara's street format
- `docs/culture-club/RECONCILIATION.md` — the v2 ↔ card-spec reconciliation decisions

---

## Debug recipes (quick reference)

**"I want to test the full loop right now without waiting for cards to arrive"**

Seed one card manually in the Firebase console:
- `members/test-m1` with `{ name: "Test", email: "test@example.com", member_id: "test-m1" }`
- `cards/test-uuid-001` with `{ member_id: "test-m1", status: "active" }`

Then visit `cccircuit.com/c/test-uuid-001` — should see the landing page. Click join, sign up with a different email. Check Firestore for the new `vouches` doc. Delete all test docs when done.

**"The assign form in admin.html is showing a network error"**

Check: is the BROADCAST_SECRET you unlocked with still valid? The token is stored in `sessionStorage` — refresh the page and re-auth. If that doesn't fix it, check Vercel logs — most likely a Firebase env var issue.

**"The board is empty when I expect it to be populated"**

- Check `cccircuit.com/api/board` directly — does the JSON show entries?
- If JSON has entries but UI is empty — it's a client-side JS error; open devtools.
- If JSON is empty — check Firestore directly. `vouches` collection should have docs with valid `status` values (`tapped`, `floor`, or `voucher`). Any other status is scored 0 and filtered out.

**"I accidentally assigned the wrong card to someone"**

In Firebase console:
- Delete the `vouches` doc for that pair if any exist
- Set `cards/<chipUid>.status = "disabled"` (the chip-landing will 410)
- Set `members/<memberId>` `card_issued_at = null` (or delete the member doc if they have no other relationship yet)
- Hand them a different card and assign it properly

**"I need to check what cards are active / who has which card"**

No admin UI for this yet. Query Firestore directly:
- `cards` collection where `status == "active"` — shows all assigned
- Each doc's `member_id` points to the owner in `members`

---

## Reminder to future you

- The cards are a marketing object with a ledger inside, not a credential. Lost cards don't break anything security-critical.
- The leaderboard is public by design. Rank is the reward, not access. Don't add auth to it.
- Circuit Block at the door captures attendance. Culture Club Card captures recruitment. Two different surfaces, two different companies. Don't merge them.
- If you find yourself wanting to build a new feature mid-run, add it to this file's backlog section. The first 6 months of live data is the moat; don't dilute it with scope creep.
