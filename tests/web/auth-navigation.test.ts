import { describe, expect, test } from "bun:test";
import { safeRequestedRedirect } from "../../apps/web/src/pages/auth/useAuthNavigation";

const APP_ORIGIN = "https://ooxml.dev";
const CLERK_FRONTEND_API = "clerk.ooxml.dev";

describe("safeRequestedRedirect", () => {
	test("returns home when no OAuth redirect was requested", () => {
		expect(safeRequestedRedirect(CLERK_FRONTEND_API, null, APP_ORIGIN)).toBe("/");
	});

	test("keeps same-origin redirects relative", () => {
		expect(
			safeRequestedRedirect(
				CLERK_FRONTEND_API,
				"https://ooxml.dev/mcp?connected=true#status",
				APP_ORIGIN,
			),
		).toBe("/mcp?connected=true#status");
	});

	test("allows the Clerk OAuth flow to continue", () => {
		const requested = "https://clerk.ooxml.dev/v1/oauth/authorize?client_id=test";

		expect(safeRequestedRedirect(CLERK_FRONTEND_API, requested, APP_ORIGIN)).toBe(requested);
	});

	test("rejects unrelated external redirects", () => {
		expect(
			safeRequestedRedirect(
				CLERK_FRONTEND_API,
				"https://attacker.example/callback",
				APP_ORIGIN,
			),
		).toBe("/");
	});
});
