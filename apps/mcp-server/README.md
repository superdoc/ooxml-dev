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
