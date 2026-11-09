-- Isolated QA ONLY. Apply solely to Neon branch br-spring-cloud-aui2mogd.
-- Never run against the default or production database.
-- Intentionally stores classification metadata, not provider payloads or identities.
CREATE TABLE IF NOT EXISTS public.isolated_fitness_provider_diagnostics (
  request_key text PRIMARY KEY,
  http_status integer,
  classification text NOT NULL CHECK (classification IN (
    'not_received', 'deployment_not_found', 'authorization_rejected',
    'completion_route_not_found', 'usage_limited', 'unspecified_not_found',
    'unclassified_http_failure'
  )),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
