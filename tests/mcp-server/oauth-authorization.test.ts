import { expect, test } from "bun:test";
import type {
	AuthRequest,
	ClientInfo,
	CompleteAuthorizationOptions,
} from "@cloudflare/workers-oauth-provider";
import { handleAuthorizationRequest } from "../../apps/mcp-server/src/oauth-authorization.ts";

const AUTHORIZE_URL =
	"https://api.ooxml.dev/authorize?response_type=code&client_id=dynamic-client&redirect_uri=http%3A%2F%2F127.0.0.1%3A45123%2Fcallback&scope=profile&state=test-state&code_challenge=test-challenge&code_challenge_method=S256&resource=https%3A%2F%2Fapi.ooxml.dev%2Fmcp";

const oauthRequest: AuthRequest = {
	responseType: "code",
	clientId: "dynamic-client",
	redirectUri: "http://127.0.0.1:45123/callback",
	scope: ["profile"],
	state: "test-state",
	codeChallenge: "test-challenge",
	codeChallengeMethod: "S256",
	resource: "https://api.ooxml.dev/mcp",
	issuer: "https://api.ooxml.dev",
};

const client: ClientInfo = {
	clientId: "dynamic-client",
	clientName: "Codex",
	redirectUris: [oauthRequest.redirectUri],
	tokenEndpointAuthMethod: "none",
};

function options(overrides?: {
	userId?: string | null;
	authentication?: { userId: string; headers?: Headers } | Response | null;
	clientInfo?: ClientInfo | null;
	complete?: (value: CompleteAuthorizationOptions) => void;
}) {
	return {
		oauth: {
			parseAuthRequest: async () => oauthRequest,
			lookupClient: async () => (overrides?.clientInfo === undefined ? client : overrides.clientInfo),
			completeAuthorization: async (value: CompleteAuthorizationOptions) => {
				overrides?.complete?.(value);
				return { redirectTo: `${oauthRequest.redirectUri}?code=test-code&state=test-state` };
			},
		},
		authenticateUser: async () => {
			if (overrides && "authentication" in overrides) return overrides.authentication ?? null;
			const userId = overrides?.userId === undefined ? "user_test" : overrides.userId;
			return userId ? { userId } : null;
		},
	};
}

test("Clerk satellite handshakes are returned to the browser", async () => {
	const response = await handleAuthorizationRequest(
		new Request(AUTHORIZE_URL),
		options({
			authentication: new Response(null, {
				status: 307,
				headers: { Location: "https://clerk.ooxml.dev/v1/client/handshake" },
			}),
		}),
	);

	expect(response.status).toBe(307);
	expect(response.headers.get("Location")).toBe(
		"https://clerk.ooxml.dev/v1/client/handshake",
	);
});

test("cookies from a completed Clerk handshake are kept on the consent response", async () => {
	const response = await handleAuthorizationRequest(
		new Request(AUTHORIZE_URL),
		options({
			authentication: {
				userId: "user_test",
				headers: new Headers({ "Set-Cookie": "__session=test; HttpOnly; Secure" }),
			},
		}),
	);

	expect(response.status).toBe(200);
	expect(response.headers.get("Set-Cookie")).toContain("__session=test");
});

test("unsigned users continue through the custom Clerk sign-in page", async () => {
	const response = await handleAuthorizationRequest(
		new Request(AUTHORIZE_URL),
		options({ userId: null }),
	);
	const redirect = new URL(response.headers.get("Location") ?? "");

	expect(response.status).toBe(302);
	expect(`${redirect.origin}${redirect.pathname}`).toBe("https://ooxml.dev/sign-in");
	expect(redirect.searchParams.get("redirect_url")).toBe(AUTHORIZE_URL);
});

test("signed-in users see the client and an explicit consent choice", async () => {
	const response = await handleAuthorizationRequest(new Request(AUTHORIZE_URL), options());
	const body = await response.text();

	expect(response.status).toBe(200);
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(response.headers.get("Content-Security-Policy")).not.toContain("form-action");
	expect(body).toContain("Connect Codex?");
	expect(body).toContain('name="decision" value="approve"');
	expect(body).toContain('name="decision" value="deny"');
});

test("client names are escaped in the consent page", async () => {
	const response = await handleAuthorizationRequest(
		new Request(AUTHORIZE_URL),
		options({ clientInfo: { ...client, clientName: "<script>alert(1)</script>" } }),
	);
	const body = await response.text();

	expect(body).not.toContain("<script>alert(1)</script>");
	expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("approval binds the Clerk user and dynamic client to the OAuth grant", async () => {
	let completed: CompleteAuthorizationOptions | undefined;
	const response = await handleAuthorizationRequest(
		new Request(AUTHORIZE_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Origin: "https://api.ooxml.dev",
			},
			body: "decision=approve",
		}),
		options({ complete: (value) => (completed = value) }),
	);

	expect(response.status).toBe(302);
	expect(response.headers.get("Location")).toContain("code=test-code");
	expect(completed).toMatchObject({
		userId: "user_test",
		scope: ["profile"],
		props: {
			userId: "user_test",
			clientId: "dynamic-client",
			scopes: ["profile"],
		},
	});
});

test("cancel returns an OAuth access_denied response without creating a grant", async () => {
	let completed = false;
	const response = await handleAuthorizationRequest(
		new Request(AUTHORIZE_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Origin: "https://api.ooxml.dev",
			},
			body: "decision=deny",
		}),
		options({ complete: () => (completed = true) }),
	);
	const redirect = new URL(response.headers.get("Location") ?? "");

	expect(response.status).toBe(302);
	expect(redirect.searchParams.get("error")).toBe("access_denied");
	expect(redirect.searchParams.get("state")).toBe("test-state");
	expect(completed).toBe(false);
});

test("consent posts from another origin are rejected", async () => {
	const response = await handleAuthorizationRequest(
		new Request(AUTHORIZE_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Origin: "https://attacker.example",
			},
			body: "decision=approve",
		}),
		options(),
	);

	expect(response.status).toBe(403);
});

test("same-origin browser posts with a null Origin are accepted", async () => {
	const response = await handleAuthorizationRequest(
		new Request(AUTHORIZE_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Origin: "null",
				"Sec-Fetch-Site": "same-origin",
			},
			body: "decision=approve",
		}),
		options(),
	);

	expect(response.status).toBe(302);
});

test("cross-site browser posts with a null Origin are rejected", async () => {
	const response = await handleAuthorizationRequest(
		new Request(AUTHORIZE_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Origin: "null",
				"Sec-Fetch-Site": "cross-site",
			},
			body: "decision=approve",
		}),
		options(),
	);

	expect(response.status).toBe(403);
});
