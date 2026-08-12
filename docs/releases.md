# Release proposal

Use Changesets to record the release impact in the pull request that introduces a change. This
replaces semantic-release, which tried to push version commits directly to protected `main`.

## Release boundaries

| Package | Version now? | Publish target |
| --- | --- | --- |
| `@ooxml-dev/web` | Yes | Git tag and GitHub Release; not npm |
| `@ooxml-dev/mcp-server` | Yes | Git tag and GitHub Release; not npm |
| `@ooxml-dev/shared` | No | None; it stays private and internal |
| Future CLI | When added | Package registry, plus a Git tag and GitHub Release |

Web and MCP versions are release notes for the hosted services. They do not control deployment.
Production continues to deploy changes from `main`. A GitHub Release means the code version landed
on `main`; deployment success remains visible in the separate Deploy workflow.

The CLI should be its own workspace package. Add it to Changesets only after its package name,
registry, and install command are decided. Keep `shared` internal if the CLI bundles it. Make
`shared` publishable only if installed CLI code needs it as a separate runtime dependency.

## Release flow

1. A product change includes a small file in `.changeset/` naming the affected package and bump.
2. On `main`, the release workflow creates or updates one version pull request.
3. The version pull request updates package versions and changelogs and passes normal review.
4. After it merges, the workflow creates tags and GitHub Releases for the new versions.
5. The existing deploy workflow continues to deploy web and MCP from `main`.

Tags use the Changesets convention:

- `@ooxml-dev/web@1.4.0`
- `@ooxml-dev/mcp-server@1.4.0`
- A future CLI would use `<package-name>@<version>`

The old `web-v*` and `mcp-v*` tags remain as history. We should not add a custom tag adapter only to
preserve those names; package-name tags are unambiguous and work for future packages without special
cases.

## Required repository setup

The release workflow uses a GitHub App installed only on this repository. The app needs repository
`Contents: read and write` and `Pull requests: read and write` permissions. Store its values as
`CHANGESETS_APP_ID` and `CHANGESETS_APP_PRIVATE_KEY` repository secrets. Each workflow run exchanges
them for a short-lived installation token.

The workflow passes the installation token through the action's `github-token` input. A pull request
created with the default `GITHUB_TOKEN` does not trigger other workflows, so CI and the required Cubic
review would not run. GitHub App requests are not controlled by the repository's **Allow GitHub
Actions to create and approve pull requests** setting.

No npm token is needed for this first version because all current release packages are private and
only receive GitHub tags and releases. Add registry authentication in the same pull request that adds
the publishable CLI.

## Rollout

1. Add the GitHub App secrets and install the app only on `superdoc/ooxml-dev`.
2. Merge this setup with its empty changeset. That proves the check works without creating a product
   release.
3. In a disposable repository, run one web patch and one MCP minor release. Confirm the version pull
   request, changelogs, tags, GitHub Releases, CI, and Cubic review.
4. Before enabling the repository workflow, create the baseline tags `@ooxml-dev/web@1.3.0` and
   `@ooxml-dev/mcp-server@1.3.0` on the current release commits. Without them, the first run would
   treat both private packages as unpublished and create both tags at the current `main` commit. Do
   not create a tag for the ignored shared package.
5. Repeat the same two-package test here before treating the workflow as the release source of truth.
6. When the CLI exists, add registry publishing as a separate, testable change.

This proposal intentionally does not make web and MCP share one version. A web-only change should not
create an MCP release, and the future CLI must be able to version independently.
