ALTER TABLE mcp_usage_events ALTER COLUMN clerk_user_id DROP NOT NULL;
ALTER TABLE mcp_usage_events ALTER COLUMN oauth_client_id DROP NOT NULL;
ALTER TABLE mcp_usage_events ADD COLUMN IF NOT EXISTS app_id TEXT;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_usage_identity' AND conrelid = 'mcp_usage_events'::regclass) THEN
  ALTER TABLE mcp_usage_events ADD CONSTRAINT mcp_usage_identity CHECK (
   (clerk_user_id IS NOT NULL AND oauth_client_id IS NOT NULL AND app_id IS NULL) OR
   (clerk_user_id IS NULL AND oauth_client_id IS NULL AND app_id IS NOT NULL)
  );
 END IF;
END $$;
