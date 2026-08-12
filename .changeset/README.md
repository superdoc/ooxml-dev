# Changesets

Add a changeset to a pull request when it changes behavior that users can notice in the web app,
MCP server, or a future published package such as the CLI.

```bash
bun run changeset
```

Select only the affected release packages and describe the user-facing change. Use:

- `patch` for fixes and small improvements
- `minor` for backward-compatible features
- `major` for breaking changes

Do not add `@ooxml-dev/shared` to a changeset. It is internal code, not a product that users install.
Instead, select each web, MCP, or future CLI package whose behavior changed.

Changes to tests, documentation, build tooling, or internal refactors do not need a changeset when
they do not affect released behavior. Add an empty changeset with `bun run changeset --empty` when
that kind of change still touches a release package and the release-intent check asks for one.

The release workflow collects changesets into a version pull request. Merging that pull request
creates package changelogs, GitHub Releases, and package-name tags. Production deployment stays
separate and still runs from every relevant push to `main`.

Run `git fetch origin main` before checking a local branch with `bun run changeset:status`.
