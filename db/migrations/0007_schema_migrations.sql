-- Record exactly which migrations have been applied to long-lived databases.
-- The runner bootstraps this table before reading it, then applies this file as
-- a normal tracked migration so future edits are protected by its checksum.

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
