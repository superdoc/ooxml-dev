# OOXML Reference MCP Server

Cloudflare Worker that exposes ECMA-376 (Office Open XML) over the Model Context Protocol. Three tool families share one server:

- **Prose search** — semantic search across the four ECMA-376 part PDFs (~18,000 chunks, embedded with Voyage, queried with pgvector).
- **Schema lookup** — deterministic queries over the parsed XSD graph (profiles, namespaces, symbols, content models, attributes, enums).
- **Package metadata** — curated OPC part-type reference (content types, source relationship types, root namespaces, typical paths in the package).

Hosted at `https://api.ooxml.dev/mcp`.

## Connect

### Claude Code

```bash
claude mcp add --transport http ooxml https://api.ooxml.dev/mcp
```

### Codex CLI

```bash
codex mcp add ooxml --url https://api.ooxml.dev/mcp
```

Or add to `~/.codex/config.toml`:

```toml
[mcp_servers.ooxml]
url = "https://api.ooxml.dev/mcp"
```

### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "ooxml": {
      "url": "https://api.ooxml.dev/mcp"
    }
  }
}
```

### Other clients

Any MCP-compatible client that speaks Streamable HTTP can connect to the endpoint directly.

## Tools

### Prose search

| Tool | Returns |
| --- | --- |
| `ooxml_search` | Semantic search over the spec PDFs |
| `ooxml_section` | Specific section by ID (e.g. `17.3.2`) |
| `ooxml_parts` | Spec part / section structure |

### Schema lookup

| Tool | Returns |
| --- | --- |
| `ooxml_element` | Canonical info for an element by qname |
| `ooxml_type` | Canonical info for a complexType or simpleType |
| `ooxml_children` | Legal children of an element, type, or group (walks inheritance) |
| `ooxml_attributes` | Attributes including inherited + attributeGroup refs |
| `ooxml_enum` | Enumeration values for a simpleType |
| `ooxml_namespace` | Vocabularies and per-profile symbol counts for a namespace URI |

Default profile is `transitional`. Future profiles will compose Transitional with Office extension schemas.

### Package metadata

| Tool | Returns |
| --- | --- |
| `ooxml_package_part` | OPC part type by content type, source relationship type, or query substring (Word / Excel / PowerPoint + cross-cutting parts) |

Curated from ECMA-376 Part 1 §11.3.x / §12.3.x / §13.3.x / §15.x. Answers package-level questions the schema graph and prose corpus don't cover (e.g. "what kind of part is `/customXml/item1.xml`?").

## Development

```bash
# Install (from repo root)
bun install

# Local dev — needs .dev.vars with DATABASE_URL and VOYAGE_API_KEY
bun run dev:mcp

# Deploy (from this directory)
bun run deploy
```

Database setup, ingest pipelines, and tests live at the repo root — see the top-level `README.md`.

## Authenticated MCP v2 beta

`/mcp-v2` is a Clerk-protected beta route that uses MCP `2026-07-28`. It stays separate from the public `/mcp` route while we test the auth flow with real users.

Clerk does not provide dynamic client registration. Clients that require it stay on the public `/mcp` route; the beta CLI uses the pre-registered `OOXML CLI` client.

It exposes the 10 public OOXML tools plus `ooxml_whoami`. Successful tool calls write the Clerk user ID, client ID, tool name, surface, and timestamp to `mcp_usage_events` and Cloudflare logs. Tokens and tool arguments are never recorded.

```bash
bun test tests/mcp-server/mcp-v2-auth.test.ts
bun run ooxml login
bun run ooxml tools
bun run ooxml call ooxml_element '{"qname":"w:p"}'
```

The CLI opens Clerk in the browser and uses Authorization Code with S256 PKCE. It receives the access token through a fixed loopback callback, then saves the token in a mode-`0600` file under the operating system's user config directory. It refreshes the token when Clerk returns a refresh token and never prints tokens.

The OAuth discovery path is `/.well-known/oauth-protected-resource/mcp-v2`. The public Clerk client allows only `http://127.0.0.1:45879/callback`, so port `45879` must be available during CLI login.

To see identified users, load `DATABASE_URL` and `CLERK_SECRET_KEY` from the root `.env` and run:

```bash
bun run mcp:v2:users
```

Clerk accepts the RFC 8707 `resource` parameter but does not include it as an access-token `aud` claim. Until Clerk supports resource audiences, the server accepts tokens only from the dedicated `OOXML CLI` client and maps that client to `/mcp-v2`. Do not reuse this OAuth client for another resource.
