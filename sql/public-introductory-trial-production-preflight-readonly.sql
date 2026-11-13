-- READ-ONLY launch preflight for the public 15-message trial.
-- Run on the explicitly verified Neon branch before authorizing any production schema migration.
-- This is NOT a migration and makes no changes.
-- The expected pre-migration result is zero introductory_trial tables/functions.
SELECT current_setting('neon.branch_id', true) AS observed_branch;
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN
  ('introductory_trial_grants','introductory_trial_requests','introductory_trial_history')
ORDER BY table_name, ordinal_position;
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN
  ('intro_trial_reserve','intro_trial_settle','intro_trial_reconcile')
ORDER BY p.proname;
-- Compare with production paid records by counts only; do not expose member identifiers.
SELECT count(*)::bigint AS existing_paid_membership_rows
FROM public.fitness_memberships;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'shared_ai_usage_%'
ORDER BY table_name;
