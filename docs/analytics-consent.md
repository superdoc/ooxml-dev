# Site analytics consent

Google Analytics and the existing SuperDoc referral click event require an affirmative analytics choice on this origin. A homepage visit or cookie choice on another domain does not grant access. The necessary local choice is versioned and expires after 180 days. Malformed, future and expired records fail closed. DNT, GPC and the existing explicit opt-out override a grant.

Cookie settings remain available on every page. Withdrawing a loaded provider disables its measurement flag, blocks the custom event, clears this site's GA cookies and reloads the document. The dialog warns users to save edits first. Other tabs and restored pages recheck the saved choice. Auth and private capability URLs never start the provider; SPA transitions across that boundary use a fresh document. Local development and previews do not send analytics to the production property.

The UI, server HTML and Markdown notice use the same substantive notice content. `/privacy`, `/privacy.md`, the footer, sitemap and agent index connect the notice and controls. Google signals and advertising personalization are disabled. Known ecosystem campaign tags and public referring origins are retained after consent; raw queries, referring paths and fragments are excluded from the initial configuration. The existing bounded CTA payload remains unchanged.

Run `bun run test:growth` for both the event and consent boundary tests. Test direct arrivals without a stored choice, rejection and reload, preferences with an unchecked analytics box, acceptance and revisit, withdrawal, privacy signals and narrow screens. Provider loading after consent is covered by isolated production-host controller tests. Local browser previews validate UI and rejected-visit network behavior without sending test events to a production analytics property.

This change does not add visitor identification, change SuperDoc's homepage consent controls or change sales qualification, outreach, review approvals or schedules.

## Required privacy follow-up and release checks

Keep this controller byte-identical to its mirror in the other site. Inspect decoded names in the URL query, the complete fragment and any hash-router query independently; a literal question mark inside a fragment value must not hide the preceding credential key. OAuth 1.0 `oauth_token` and `oauth_verifier` are private as well as OAuth 2 token/code fields. Keep benign public anchors eligible and preserve the exact navigation target while disabling measurement on a private transition.

Consent-negative CTA tests must use the actual site's matching production host and project, first prove that the granted control can emit, then prove absent/rejected consent emits nothing. Removing consent enforcement must make that negative test fail. Preserve refusal, withdrawal, DNT/GPC and bounded payload coverage. Use synthetic controller inputs only; never send verification events to the production property.

Carry accepted privacy findings into this same runbook, selected controller and existing `test:growth` CI check. Before normal maintainer release, retain the exact source head, failing-before/passing-after evidence, actual build/check receipts and any remaining review holds. Human review and deployed behavior remain separate from a green fixture.
