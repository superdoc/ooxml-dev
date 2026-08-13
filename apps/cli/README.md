# OOXML CLI

Use the OOXML reference from a terminal or an agent skill. Sign in with Clerk to query the hosted ooxml.dev service.

While the package is private, run it from the repository root:

```bash
bun run ooxml login
bun run ooxml search "paragraph spacing"
bun run ooxml element w:p
bun run ooxml children w:p
bun run ooxml attributes w:p
bun run ooxml logout
```

During this private test, the CLI stores sign-in tokens as plain text in your application data directory. Do not use it from a shared account. The CLI does not store queries or results.

The bundled [`research-ooxml`](../../skills/research-ooxml/SKILL.md) skill tells agents which commands to use and how to combine schema and specification evidence.

MCP is an internal transport detail. It is not part of the CLI or skill interface.

The package remains private while we test it. Secure credential storage and npm publishing are separate release steps.
