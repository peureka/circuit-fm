-- Circuit-side setup for the cccircuit webhook integration.
--
-- Run this ONCE against Circuit's production Postgres when ready to wire
-- check-ins to Culture Club. Safe to re-run: inserts use ON CONFLICT DO
-- NOTHING where applicable.
--
-- REQUIRES a psql variable `secret` containing the shared webhook secret.
-- Example invocation:
--
--   psql "$CIRCUIT_DB_URL" -v secret="636ff0e2bcd095...." \
--     -f scripts/circuit-integration.sql
--
-- The same `secret` value MUST match CIRCUIT_WEBHOOK_SECRET in cccircuit's
-- Vercel env. Already set there (as of 2026-04-24). Ask PJ if unsure.
--
-- This script does NOT create a Location or Organiser. LINECONIC already
-- has an Organiser in Circuit (see LINECONIC_ORGANISER_ID in Circuit's env
-- vars) and the Soho House Greek Street location likely already exists
-- under that organiser. Verify with the initial SELECTs below.

\set ON_ERROR_STOP on

\echo '=== 1. Current state ==='

\echo 'Existing organisations:'
SELECT id, name, created_at FROM organisations ORDER BY created_at DESC LIMIT 10;

\echo 'LINECONIC organiser (from env var LINECONIC_ORGANISER_ID — resolve by name too):'
SELECT id, display_name, handle FROM organisers WHERE handle ILIKE '%lineconic%' OR display_name ILIKE '%lineconic%';

\echo 'Locations under LINECONIC-like organisers (look for Soho House):'
SELECT l.id, l.name, l.city, l.organiser_id, o.display_name AS organiser
FROM locations l
JOIN organisers o ON o.id = l.organiser_id
WHERE o.handle ILIKE '%lineconic%' OR o.display_name ILIKE '%lineconic%';

\prompt 'Press enter to proceed with the inserts, Ctrl-C to abort. Review the output above first. ' dummy

BEGIN;

-- ─── 2. Create Culture Club as an Organisation (if not already) ───

\echo 'Creating Culture Club organisation (or no-op if exists):'

INSERT INTO organisations (id, name, created_at)
SELECT gen_random_uuid(), 'Culture Club', NOW()
WHERE NOT EXISTS (SELECT 1 FROM organisations WHERE name = 'Culture Club');

-- Capture the Culture Club org ID for subsequent statements
\set cc_org_query 'SELECT id FROM organisations WHERE name = ''Culture Club'' LIMIT 1'
SELECT id AS culture_club_org_id FROM organisations WHERE name = 'Culture Club';

-- ─── 3. Link LINECONIC organiser as a Culture Club member ───

\echo 'Linking LINECONIC organiser → Culture Club org (OrganisationMember):'

-- Resolve LINECONIC organiser by handle — adjust this WHERE clause if the
-- handle is different in your DB. You can also hard-code the UUID from the
-- LINECONIC_ORGANISER_ID env var if the handle lookup fails.
INSERT INTO organisation_members (
  id, organisation_id, organiser_id, role, relationship_type, active, created_at, onboarding_status
)
SELECT
  gen_random_uuid(),
  (SELECT id FROM organisations WHERE name = 'Culture Club' LIMIT 1),
  o.id,
  'admin',
  'owned',
  true,
  NOW(),
  'active'
FROM organisers o
WHERE (o.handle ILIKE '%lineconic%' OR o.display_name ILIKE '%lineconic%')
ON CONFLICT (organisation_id, organiser_id) DO NOTHING;

-- ─── 4. Create the EnterpriseWebhook subscription ───

\echo 'Creating EnterpriseWebhook subscription:'

INSERT INTO enterprise_webhooks (
  id, organisation_id, url, events, signing_secret, active, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM organisations WHERE name = 'Culture Club' LIMIT 1),
  'https://www.cccircuit.com/api/webhooks/circuit-checkin',
  ARRAY['attendance.created'],
  :'secret',
  true,
  NOW(),
  NOW()
);

-- ─── 5. Verify ───

\echo '=== After inserts ==='

\echo 'Culture Club organisation:'
SELECT id, name, created_at FROM organisations WHERE name = 'Culture Club';

\echo 'Organisation members linking to Culture Club:'
SELECT om.id, om.role, o.display_name AS organiser_name
FROM organisation_members om
JOIN organisers o ON o.id = om.organiser_id
JOIN organisations org ON org.id = om.organisation_id
WHERE org.name = 'Culture Club';

\echo 'Enterprise webhooks for Culture Club:'
SELECT id, url, events, active, created_at FROM enterprise_webhooks
WHERE organisation_id = (SELECT id FROM organisations WHERE name = 'Culture Club' LIMIT 1);

COMMIT;

\echo ''
\echo '=== Done. Next steps ==='
\echo '1. Save the Culture Club organisation UUID printed above.'
\echo '2. When you create the May 20 Event, note its Event.id.'
\echo '3. In cccircuit admin, paste that Event.id into the May 20 outing''s'
\echo '   circuit_event_id field.'
\echo '4. Smoke test: ./scripts/smoke-circuit-webhook.sh'
