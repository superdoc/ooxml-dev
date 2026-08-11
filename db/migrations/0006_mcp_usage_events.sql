-- Keep authenticated MCP usage queryable after Cloudflare log retention ends.
-- Store only Clerk's stable user id and request metadata; names and email stay
-- in Clerk and can be resolved by the admin report when needed.

CREATE TABLE IF NOT EXISTS mcp_usage_events (
  id BIGSERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  oauth_client_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  surface TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_usage_events_user_time
  ON mcp_usage_events(clerk_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_usage_events_time
  ON mcp_usage_events(occurred_at DESC);
