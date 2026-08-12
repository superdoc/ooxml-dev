<img width="300" alt="logo" src="https://github.com/user-attachments/assets/df6311a6-c050-4592-bbf1-4a2228655bc3" />

[![Web](https://img.shields.io/github/v/tag/superdoc/ooxml-dev?filter=%40ooxml-dev%2Fweb%40*&label=Web&color=blue)](https://ooxml.dev)
[![MCP Server](https://img.shields.io/github/v/tag/superdoc/ooxml-dev?filter=%40ooxml-dev%2Fmcp-server%40*&label=MCP%20Server&color=blue)](https://api.ooxml.dev/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The OOXML spec, explained by people who actually implemented it.

## What is this?

An interactive reference for OOXML, built by the team behind [SuperDoc](https://superdoc.dev). Every page combines XML structure, live rendered previews, and implementation notes the spec leaves out. The MCP server exposes the same knowledge to AI assistants: prose search across the spec PDFs and deterministic schema lookup over the parsed XSDs.

- **Live previews** - Edit XML and see it render in real-time. Every example is a working document.
- **Implementation notes** - Where Word diverges from the spec, what will break your code, and what to do about it.
- **Semantic spec search** - 18,000+ spec chunks searchable by meaning via MCP server.
- **Structural schema lookup** - Element children, attributes, types, enums, namespaces. Same MCP server, deterministic answers from the parsed XSDs.

## Why?

The ECMA-376 spec is 5,000+ pages and it lies. Word's actual behavior diverges from the standard in ways you only discover by building against it. The knowledge to implement OOXML correctly is locked inside a handful of companies that have no incentive to share it.

We faced this at SuperDoc — building a document engine on native OOXML with no roadmap beyond an unreliable spec. We wrote down everything we learned and made it public. No one should have to reverse-engineer Word alone.

## MCP Server

Ask questions in natural language and get answers grounded in the spec, or query the schema graph for precise structural answers. Works with Claude Code, Codex CLI, Cursor, and any MCP-compatible client.

**Claude Code**

```bash
claude mcp add --transport http ooxml https://api.ooxml.dev/mcp
```

**Codex CLI**

```bash
codex mcp add ooxml --url https://api.ooxml.dev/mcp
```

Or in `~/.codex/config.toml`:

```toml
[mcp_servers.ooxml]
url = "https://api.ooxml.dev/mcp"
```

**Cursor** — add to your MCP settings:

```json
{
  "mcpServers": {
    "ooxml": { "url": "https://api.ooxml.dev/mcp" }
  }
}
```

Four tool families share one server:

- **Prose search** (over the spec PDFs): `ooxml_search`, `ooxml_section`, `ooxml_parts`
- **Schema lookup** (over the parsed XSDs): `ooxml_element`, `ooxml_type`, `ooxml_children`, `ooxml_attributes`, `ooxml_enum`, `ooxml_namespace`
- **Package metadata** (curated from Part 1 §11.3.x / §12.3.x / §13.3.x / §15.x): `ooxml_package_part`
- **Preset shapes** (generated from Part 1 Annex D): `ooxml_preset_shape`

### Authentication

`/mcp` uses OAuth 2.1. Compatible MCP clients register automatically, open the ooxml.dev sign-in and consent pages, and receive a token limited to this MCP server. Clerk handles user identity; the MCP server handles dynamic client registration, PKCE, tokens, refresh, and revocation.

## Development

```bash
bunx --package vite-plus@0.2.9 vp install --frozen-lockfile  # Install dependencies
bun dev                                                   # Dev server at http://localhost:5173
bun run check                                             # Format, lint, and type-check
bun run build                                             # Production build
bun run build:prod                                        # Build with .env.prod
```

Vite+ owns the web development, build, formatting, linting, workspace task, and Git hook
workflows. Bun remains the package manager and test runtime because the test suite uses `bun:test`.

`build:prod` requires a live Clerk publishable key. This prevents production deploys from using the
auth fallback or a test Clerk instance.

## Contributing

Contributions welcome. Add implementation notes, fix examples, or improve the reference.

## License

MIT

---

Built by 🦋 [SuperDoc — DOCX editing and tooling](https://superdoc.dev)
