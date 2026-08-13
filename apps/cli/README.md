# OOXML CLI

Use the OOXML reference from a terminal or an agent skill.

## Install

Node.js 20 or later is required.

```bash
npm install --global @ooxml-dev/cli
```

## Use the CLI

Sign in, then query the reference:

```bash
ooxml login
ooxml search "paragraph spacing"
ooxml element w:p
ooxml children w:p
ooxml attributes w:p
ooxml logout
```

The CLI uses the production ooxml.dev service. You may need to create an account and sign in. Sign-in is only used to control usage; the service is free.

The CLI stores sign-in tokens as plain text in your application data directory. Do not use it from a shared account. It does not store queries or results.

## Install the agent skill

The bundled [`research-ooxml`](../../skills/research-ooxml/SKILL.md) skill tells coding agents which commands to use and how to combine schema and specification evidence.

```bash
npx skills add superdoc/ooxml-dev --skill research-ooxml -g -y
```

MCP is an internal transport detail. It is not part of the CLI or skill interface.
