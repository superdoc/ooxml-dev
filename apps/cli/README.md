# OOXML CLI

The CLI gives people and agents a stable shell interface to the OOXML reference. It uses Clerk sign-in and the hosted OOXML service.

```bash
bun run ooxml login
bun run ooxml search "paragraph spacing"
bun run ooxml element w:p
bun run ooxml children w:p
bun run ooxml attributes w:p
bun run ooxml logout
```

OAuth tokens stay in a user-only local credentials file. Tool inputs and results are not stored.

The public commands use OOXML terms. MCP is an internal transport detail and is not part of the CLI contract.

This package is private while we test the complete login and query flow. Publishing it to npm is a separate release step.
