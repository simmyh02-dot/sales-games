-- The last piece of inline boot-time DDL.
--
-- This table was created by a CREATE TABLE IF NOT EXISTS fired on every boot,
-- which meant every cold start opened a connection to do nothing, racing the
-- migration runner for a waking Neon compute. It already exists in production,
-- so this migration is a no-op there and simply moves ownership of the schema
-- to the place that owns the rest of it.

CREATE TABLE IF NOT EXISTS generated_cache (
  id SERIAL PRIMARY KEY,
  kind TEXT,
  payload JSONB,
  created_at BIGINT
);

-- loadCaches reads the newest rows per kind on every boot and never had an
-- index for it.
CREATE INDEX IF NOT EXISTS idx_generated_cache_kind ON generated_cache (kind, id DESC);
