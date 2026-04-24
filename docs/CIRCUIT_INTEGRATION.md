# Circuit ↔ Culture Club Integration

How Circuit check-ins automatically populate Culture Club attendance, advance
vouches, and keep the leaderboard honest in real time.

---

## Architecture

Two separate products, one shared event:

```
Guest taps Block at LINECONIC entrance
  ↓
Circuit records check-in  (circuit repo, Next.js + Prisma + Postgres)
  ↓  (webhook dispatch)
cccircuit receives webhook  (this repo, Firebase + Vercel Functions)
  ↓
attendance doc written + matching vouches advanced tapped→floor
  ↓
/board re-ranks
```

Neither side hard-depends on the other. Circuit runs fine without Culture
Club (it's a general attendance system). Culture Club runs fine without
Circuit (attendance can be recorded manually via `/api/attendance` or the
admin panel's "record attendance" form). The webhook is a convenience, not
a coupling.

---

## What's already built (cccircuit side)

- **`POST /api/webhooks/circuit-checkin`** — receives Circuit check-in events.
  HMAC-SHA256 signature-verified against `CIRCUIT_WEBHOOK_SECRET`. Maps
  Circuit event IDs to Culture Club outings via `outings.circuit_event_id`.
  Records attendance, advances `tapped → floor` vouches, returns a status
  describing what happened (recorded / skipped / ignored).
- **`outings.circuit_event_id` field** — new optional string field on outings.
  Set it in the admin panel when creating/editing an outing. If absent, the
  webhook skips cleanly (`action: "skipped_unmapped_event"`).
- **Admin UI** — the outing form has a "circuit event id" input.

## What needs to happen (circuit side)

### 1. Set up Culture Club as an Organisation on Circuit

Via Circuit's admin panel or provisioning script:
- **Organisation:** name `Culture Club`, slug `culture-club`
- **Location(s):** at minimum `Soho House — Greek Street` (London LINECONIC
  venue). Add NYC venue when that starts.
- **Block:** provision one Block for the Location via
  `scripts/provision-block.ts`. Mount it at the entrance on the night.
- **Organiser accounts:** PJ and Ciara as organisers on the Culture Club
  organisation. Ashton has visibility if he wants it.

### 2. Create the May 20 event

- **Name:** `LINECONIC May 20`
- **Format:** `show`
- **Location:** the Soho House Greek Street Location
- **Date:** 2026-05-20
- **Organisation:** Culture Club
- Capture the resulting Event ID — this goes into the Culture Club outing's
  `circuit_event_id` field (see Step 4 below).

### 3. Configure the webhook dispatch

Circuit already has webhook infrastructure (`ReturnSource.webhook` in the
enum, `enterprise-webhooks` module, `crm-delivery` module). The new work is
a webhook subscription that fires on check-in events.

**Required config (env vars on Circuit's Vercel project):**
```
CCCIRCUIT_WEBHOOK_URL = https://www.cccircuit.com/api/webhooks/circuit-checkin
CCCIRCUIT_WEBHOOK_SECRET = <same value as cccircuit's CIRCUIT_WEBHOOK_SECRET>
```

Generate the secret once with `openssl rand -hex 32`. Store it in BOTH
Vercel projects under the corresponding env var names.

**Webhook payload Circuit should POST:**

```json
{
  "event_type": "checkin.created",
  "circuit_event_id": "<Circuit's Event.id>",
  "guest": {
    "email": "ada@example.com",
    "name": "Ada Lovelace",
    "phone": "+447000000000"
  },
  "checked_in_at": "2026-05-20T20:15:00Z"
}
```

Headers:
- `Content-Type: application/json`
- `X-Circuit-Signature: <HMAC-SHA256 hex of the raw request body using the shared secret>`

**Which check-ins to dispatch:**
- All successful check-ins (`Return.status = attended`, `Return.source = tap`).
- Dispatch async — don't block the guest's tap response on webhook success.
- Retry on 5xx with exponential backoff (standard webhook pattern).
- Do NOT retry on 2xx (even if `action = "skipped_unmapped_event"` — that's
  an acknowledged non-action).

### 4. Link the Circuit Event to the Culture Club outing

Once the May 20 Event exists on Circuit:
1. Copy the Event ID
2. In cccircuit admin: Outings tab → edit the May 20 outing → paste the
   Circuit Event ID into `circuit_event_id` field → save.

From that moment on, every tap at the Block at that event flows through
the webhook → attendance → leaderboard.

### 5. (Optional) Surface Culture Club attendance in Circuit

Not required, but the reverse flow is valuable for the SEIS pitch: Circuit
can query Culture Club's leaderboard to show which guests are top vouchers.
This would be a simple cccircuit endpoint (`GET /api/board?expanded=true`
with auth, returning member emails + scores). Deferred until Circuit needs it.

---

## Testing the integration

**Local / dev:**
1. Generate a test secret: `openssl rand -hex 16`
2. Export: `CIRCUIT_WEBHOOK_SECRET=<test-secret>`
3. Build a test payload: `BODY='{"event_type":"checkin.created","circuit_event_id":"test","guest":{"email":"test@example.com"}}'`
4. Sign: `SIG=$(printf "%s" "$BODY" | openssl dgst -sha256 -hmac "<test-secret>" | awk '{print $2}')`
5. POST:
   ```bash
   curl -X POST https://www.cccircuit.com/api/webhooks/circuit-checkin \
     -H "Content-Type: application/json" \
     -H "X-Circuit-Signature: $SIG" \
     -d "$BODY"
   ```

Expected: `200 OK` with `action: "skipped_unmapped_event"` (because no outing
maps to `circuit_event_id = "test"`).

**End-to-end (May 20 dry run, 2026-05-18):**
1. Circuit has Culture Club org + Soho House location + Block + event + webhook configured
2. Tap the Block with your phone
3. Check `cccircuit.com/admin` → Dashboard → outings — attendance count for the May 20 outing should bump
4. Check `/board` — if you were a vouched recipient, your voucher's rank should update

---

## Failure modes and what to do

| Failure | What you see | Fix |
|---|---|---|
| Signature mismatch | Circuit webhook logs 401 from cccircuit | Secrets out of sync. Regenerate, update BOTH Vercel projects, redeploy both. |
| `skipped_unmapped_event` in cccircuit logs | Taps not producing attendance | Outing's `circuit_event_id` is wrong or empty. Copy Event ID from Circuit, paste into outing form. |
| `skipped_no_email` | Walk-in guests without email don't count | Expected. Culture Club attendance is email-keyed because vouches are email-keyed. If many walk-ins, manual entry via admin panel's "record attendance" form. |
| Webhook never fires | No activity in cccircuit logs | Circuit's webhook subscription not configured or the event-type filter excludes check-ins. Check Circuit's webhook admin. |
| Duplicate attendance | Attendance for same (outing, email) tried twice | Idempotent by design. Second write is a no-op. Vouch advancement is idempotent too (vouches at "floor" aren't re-touched). |

---

## The SEIS-deck payoff

Once this is wired, Circuit can produce statements like:

> "Culture Club ran 14 outings between May and September 2026. 47 members
> attended 4+ outings across all four formats. Cross-venue identity: 62%
> of Culture Club Core Members also attended at least one event at a
> separate operator venue on Circuit. Return-rate by operator: Albany 68%,
> tvg 54%, Copeland 71%."

None of that exists yet. The data infrastructure to produce it does, as of
this integration landing.
