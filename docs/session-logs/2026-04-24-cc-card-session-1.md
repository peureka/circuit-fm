# 2026-04-24 — cccircuit — Culture Club Card build, session 1

**Goal**: Ship the schema + join-form upgrade (session 1 of 5 in the Card + Leaderboard build brief). Capture `name` alongside `email` on signup, with a full test suite passing first.

**Done**:
- Added `docs/BUILD_BRIEF.md` — the 5-session implementation plan for the Card + Board loop.
- Set up `node:test` infrastructure with in-memory Firestore and Resend fakes under `test/helpers/`.
- Refactored `api/signup.js` to use dependency injection (`createHandler({ db, resend, segmentId, from, timestamp })`) so handlers are testable without Firebase env vars. Production path is unchanged externally (default export); deps are lazy-initialized on first invocation.
- Extended signup to accept an optional `name` field: trimmed, validated (must be a non-empty string if provided), and stored on the `signups` doc.
- Updated `firestore.rules` to allow `name` on `signups` docs (1–99 chars, optional).
- Updated `index.html` form to capture `name` before `email` and pass both to `/api/signup`.
- Updated `package.json` with `"test": "node --test"` and `"engines": { "node": ">=20" }`.

**Tests added** (`test/signup.test.js`, 10 cases):
- POST with email + name stores both
- POST with email only still works (backwards compatible)
- POST with missing email → 400
- POST with invalid email → 400
- POST with whitespace-only name → 400
- POST with non-string name → 400
- GET → 405
- name is trimmed before storage
- duplicate signup (resend 409) → `duplicate: true`, no confirmation email
- new signup fires a confirmation email via resend

All 13 tests green (10 signup + 3 helper-module no-op tests from the runner picking up test/helpers/*.js).

**Decisions**:
- Used `node:test` over Jest/Vitest — zero dependency cost, sufficient for handler-level tests.
- In-memory Firestore fake instead of the Firebase Local Emulator. Cheaper to run, faster to iterate. Emulator can be added later if integration coverage becomes valuable.
- Firebase/Resend initialization deferred from module load to first invocation, so `require('../api/signup')` succeeds in tests without real env vars.
- `name` field is optional on `signups` — existing email-only entries remain valid, new entries default to capturing it.
- `members`, `cards`, and `vouches` collections NOT added in this session. Deferred to the sessions that actually use them (2, 3, 4) per the BUILD_BRIEF.md.

**Deferred to backlog**:
- Mobile-responsive two-input form layout (currently both inputs sit on one flex row; narrow screens will be cramped).
- Firebase emulator integration for deeper tests.
- Ensure `members`, `cards`, `vouches` collection rules land in their respective future sessions.

**Smoke test** (not runnable in this session — requires deployed Vercel env with real Firebase + Resend):
1. Open `cccircuit.com`, click "Join the club".
2. Fill name = "Session 1 Smoke" and email = some fresh test address.
3. Submit.
4. Verify the Firestore console shows a new `signups` doc with both fields.
5. Verify a confirmation email lands in the test inbox.

**Next**: Session 2 — tap landing route at `api/c/[chipUid].js`, introduces `members` and `cards` Firestore collections and a tap-landing HTML page.
