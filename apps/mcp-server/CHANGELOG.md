# @ooxml-dev/mcp-server

## 1.5.0

### Minor Changes

- 60b81e7: Support a revocable Pip application key for existing OOXML read tools. The CLI accepts OOXML_API_KEY without browser login; the server records application usage separately from Clerk users. Apply migration 0008 before activating the Worker.

### Patch Changes

- 586d52b: Fix the MCP sign-in loop after a fresh email sign-in by keeping Clerk's cookie updates on the sign-in redirect.

## 1.4.0

### Minor Changes

- 6a4ba4d: Add a tool for looking up DrawingML preset-shape adjust guides.
