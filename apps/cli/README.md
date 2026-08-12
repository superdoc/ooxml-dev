# OOXML CLI

Use the OOXML reference from a terminal or an agent skill. The CLI signs in with Clerk and sends queries to the hosted ooxml.dev service.

While the package is private, run it from the repository root:

```bash
bun run ooxml login
bun run ooxml search "paragraph spacing"
bun run ooxml element w:p
bun run ooxml children w:p
bun run ooxml attributes w:p
bun run ooxml logout
```

For this private test, sign-in credentials are stored in the current user's application data directory. The CLI does not store query inputs or results.

The bundled [`research-ooxml`](../../skills/research-ooxml/SKILL.md) skill helps agents choose the right commands and combine schema and specification evidence.

MCP is an internal transport detail. It is not part of the CLI or skill interface.

The package is private for this first test. Moving credentials to the operating system's secure store and publishing to npm are separate release steps.
