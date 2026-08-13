<img width="300" alt="logo" src="https://github.com/user-attachments/assets/df6311a6-c050-4592-bbf1-4a2228655bc3" />

[![Web](https://img.shields.io/github/v/tag/superdoc/ooxml-dev?filter=%40ooxml-dev%2Fweb%40*&label=Web&color=blue)](https://ooxml.dev)
[![MCP Server](https://img.shields.io/github/v/tag/superdoc/ooxml-dev?filter=%40ooxml-dev%2Fmcp-server%40*&label=MCP%20Server&color=blue)](https://api.ooxml.dev/mcp)
[![npm](https://img.shields.io/npm/v/%40ooxml-dev%2Fcli?label=CLI&color=CB3837&logo=npm)](https://www.npmjs.com/package/@ooxml-dev/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The OOXML spec, explained by people who actually implemented it.

> [!NOTE]
> The CLI and MCP server use the production ooxml.dev service. You may need to create an account and sign in. Sign-in is only used to control usage; the service is free.

## What is this?

ooxml.dev is an interactive OOXML reference built by the team behind [SuperDoc](https://superdoc.dev). It combines XML examples, live previews, and implementation notes with searchable specification text and schema data.

- **Live previews** — Edit XML and see the result immediately. Every example is a working document.
- **Implementation notes** — Learn where Word differs from the specification and which details can break an implementation.
- **Specification search** — Search more than 18,000 specification chunks by meaning.
- **Schema lookup** — Inspect element children, attributes, types, enums, and namespaces from the parsed XSDs.

## Why?

ECMA-376 is more than 5,000 pages, and Word sometimes behaves differently from the standard or fills in details the text leaves unclear. Many of these differences appear only while building a document engine.

We found these gaps while building SuperDoc. This project records what we learned so other implementers do not need to discover the same edge cases alone.

## CLI ![New](https://img.shields.io/badge/-NEW-2563EB)

Install the CLI with npm. Node.js 20 or later is required.

```bash
npm install --global @ooxml-dev/cli
```

Sign in, then query the reference:

```bash
ooxml login
ooxml search "paragraph spacing"
ooxml element w:p
```

See the [CLI README](apps/cli/README.md) for all commands.

## Agent skill

The [`research-ooxml`](skills/research-ooxml/SKILL.md) skill teaches coding agents how to combine specification search and schema evidence through the CLI. Install the CLI first, then add the skill:

```bash
npx skills add superdoc/ooxml-dev --skill research-ooxml -g -y
```

## MCP Server

Search specification prose or query the schema graph for precise structural answers. The server works with Claude Code, Codex CLI, Cursor, and other MCP clients.

> [!NOTE]
> The hosted server uses MCP `2026-07-28` and remains compatible with current 2024 and 2025 clients.

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

**Cursor**

Add the server to your MCP settings:

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

## Development

```bash
bunx --package vite-plus@0.2.9 vp install --frozen-lockfile  # Install dependencies
bun dev                                                   # Dev server at http://localhost:5173
bun run check                                             # Format, lint, and type-check
bun run build                                             # Production build
bun run build:prod                                        # Build with .env.prod
```

Vite+ handles local development, builds, formatting, linting, workspace tasks, and Git hooks. Bun remains the package manager and test runtime because the tests use `bun:test`.

`build:prod` requires a live Clerk publishable key. This prevents a production deployment from using the auth fallback or a test Clerk instance.

## Contributing

Contributions are welcome. Add implementation notes, fix examples, or improve the reference.

## License

MIT

---

Built by 🦋 [SuperDoc — DOCX editing and tooling](https://superdoc.dev)
