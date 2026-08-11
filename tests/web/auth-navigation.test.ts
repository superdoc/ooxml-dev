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

	test("keeps network-path-looking redirects on ooxml.dev", () => {
		const requested = "https://ooxml.dev//attacker.example/path%60";
		const redirect = safeRequestedRedirect(CLERK_FRONTEND_API, requested, APP_ORIGIN);

		expect(redirect).toBe("/attacker.example/path%60");
		expect(new URL(redirect, APP_ORIGIN).origin).toBe(APP_ORIGIN);
	});

	test("allows the Clerk OAuth flow to continue", () => {
		const requested = "https://clerk.ooxml.dev/v1/oauth/authorize?client_id=test";

		expect(safeRequestedRedirect(CLERK_FRONTEND_API, requested, APP_ORIGIN)).toBe(requested);
	});

	test("allows MCP authorization to continue after Clerk sign-in", () => {
		const requested =
			"https://api.ooxml.dev/authorize?client_id=test&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback";

		expect(safeRequestedRedirect(CLERK_FRONTEND_API, requested, APP_ORIGIN)).toBe(requested);
	});

	test("allows the configured local MCP authorization origin", () => {
		const requested = "http://localhost:8787/authorize?client_id=test";

		expect(
			safeRequestedRedirect(
				CLERK_FRONTEND_API,
				requested,
				"http://localhost:5173",
				"http://localhost:8787",
			),
		).toBe(requested);
	});

	test("rejects other API paths as auth redirects", () => {
		expect(
			safeRequestedRedirect(
				CLERK_FRONTEND_API,
				"https://api.ooxml.dev/search",
				APP_ORIGIN,
			),
		).toBe("/");
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
