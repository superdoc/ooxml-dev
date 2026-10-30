# Pip application access

The first application credential is for SuperDoc's Pip. It calls the existing
read-only MCP tools at `https://api.ooxml.dev/mcp`. Human OAuth remains available.
There is no registration UI or application OAuth flow.

## Activation order

1. Apply database migration `0008_mcp_app_usage.sql` using `bun run db:migrate`.
   It preserves user usage and records application usage with `app_id = 'pip'`,
   without a Clerk user or OAuth client. `mcp:users` remains human-only.
2. Generate 32 random bytes encoded as lowercase hex, prefixed `ooxml_app_`.
   Keep the complete key in Pip's host secret store as `PIP_OOXML_API_KEY`.
   Never pass it in command arguments, chat, or the investigation sandbox.
3. SHA-256 the complete key (including prefix, no trailing newline). Configure
   only its lowercase hex digest as Worker secret `PIP_API_KEY_SHA256`.
4. Deploy this Worker and release the updated `@ooxml-dev/cli`. Update the
   SuperDoc plugin's exact CLI version and Pip's approved plugin pin together.
5. Add the Pip host adapter invoking the canonical plugin OOXML wrapper with
   `OOXML_API_KEY` set only in that subprocess's restricted environment.
6. Verify a reference query from the deployed host and its application usage row.

The CLI sends the key only to the fixed HTTPS MCP endpoint and rejects redirects.
When `OOXML_API_KEY` is set, it never opens the user credential store or browser,
including on authentication failure. An empty key is an error, not OAuth fallback.

Remove `PIP_API_KEY_SHA256` to revoke access, or replace it and Pip's key to rotate.
There is one active key, no automatic expiry, and no per-application quotas in
this increment. Existing tools only read published reference data; adding write
tools later requires an authorization policy before exposing them to this key.

Application usage can be inspected directly:

```sql
SELECT app_id, tool_name, occurred_at
FROM mcp_usage_events
WHERE app_id = 'pip'
ORDER BY occurred_at DESC
LIMIT 20;
```

Local tests use synthetic keys and the real MCP client/handler with a bundled
reference tool. They do not establish deployed access to the database-backed
search tools. No production secret, migration, deployment or release is performed
by the test suite.
