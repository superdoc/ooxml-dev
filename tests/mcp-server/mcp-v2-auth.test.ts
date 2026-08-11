import { expect, test } from "bun:test";
import {
	createClerkOAuthTokenVerifier,
	createMcpV2Handler,
	MCP_V2_PROTOCOL_VERSION,
	MCP_V2_TOOL_NAME,
	protectedResourceMetadataResponse,
	protectedResourceMetadataUrl,
	type UsageEvent,
} from "../../apps/mcp-server/src/mcp-v2.ts";

const USER_ID = "user_test_mcp_v2";
const CLIENT_ID = "ooxml_cli_test";
const RESOURCE_URL = "https://api.ooxml.dev/mcp-v2";
const METADATA_URL = "https://api.ooxml.dev/.well-known/oauth-protected-resource/mcp-v2";
const AUTHORIZATION_SERVER = "https://clerk.example";

function oauthVerifier(
	overrides: Partial<{
		clientId: string;
		expired: boolean;
		expiration: number;
		revoked: boolean;
		scopes: string[];
	}> = {},
) {
	return createClerkOAuthTokenVerifier({
		secretKey: "unused-in-test",
		expectedClientId: CLIENT_ID,
		expectedResourceUrl: RESOURCE_URL,
		accessTokenClient: {
			async verify() {
				return {
					clientId: overrides.clientId ?? CLIENT_ID,
					subject: USER_ID,
					scopes: overrides.scopes ?? ["profile"],
					revoked: overrides.revoked ?? false,
					expired: overrides.expired ?? false,
					expiration: overrides.expiration ?? Date.now() + 300_000,
				};
			},
		},
	});
}

function toolCall(
	token?: string,
	name = MCP_V2_TOOL_NAME,
	args: Record<string, unknown> = {},
): Request {
	const headers = new Headers({
		"Content-Type": "application/json",
		"MCP-Protocol-Version": MCP_V2_PROTOCOL_VERSION,
		"Mcp-Method": "tools/call",
		"Mcp-Name": name,
	});
	if (token) headers.set("Authorization", `Bearer ${token}`);

	return new Request(RESOURCE_URL, {
		method: "POST",
		headers,
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: {
				name,
				arguments: args,
				_meta: {
					"io.modelcontextprotocol/protocolVersion": MCP_V2_PROTOCOL_VERSION,
					"io.modelcontextprotocol/clientInfo": {
						name: "ooxml-auth-test",
						version: "1.0.0",
					},
					"io.modelcontextprotocol/clientCapabilities": {},
				},
			},
		}),
	});
}

test("a verified Clerk OAuth identity reaches MCP 2026-07-28 and the usage recorder", async () => {
	expect(MCP_V2_PROTOCOL_VERSION).toBe("2026-07-28");
	expect(protectedResourceMetadataUrl(RESOURCE_URL)).toBe(METADATA_URL);
	const events: UsageEvent[] = [];
	const handler = createMcpV2Handler({
		verifier: oauthVerifier(),
		usageRecorder: { record: (event) => events.push(event) },
		resourceMetadataUrl: METADATA_URL,
		toolExecutor: async () => "unused",
		now: () => new Date("2026-08-11T12:00:00.000Z"),
	});

	const response = await handler(toolCall("oat_test"));
	const body = (await response.json()) as {
		result?: { resultType?: string; content?: Array<{ text?: string }> };
	};

	expect(response.status).toBe(200);
	expect(body.result?.resultType).toBe("complete");
	expect(body.result?.content?.[0]?.text).toBe(`Authenticated as ${USER_ID}`);
	expect(events).toEqual([
		{
			userId: USER_ID,
			tool: MCP_V2_TOOL_NAME,
			surface: "mcp-v2",
			client: CLIENT_ID,
			occurredAt: "2026-08-11T12:00:00.000Z",
		},
	]);
});

test("a missing token returns a discoverable OAuth challenge", async () => {
	const handler = createMcpV2Handler({
		verifier: oauthVerifier(),
		usageRecorder: { record: () => {} },
		resourceMetadataUrl: METADATA_URL,
		toolExecutor: async () => "unused",
	});

	const response = await handler(toolCall());
	const challenge = response.headers.get("WWW-Authenticate");

	expect(response.status).toBe(401);
	expect(challenge).toContain("Bearer");
	expect(challenge).toContain(`resource_metadata="${METADATA_URL}"`);
});

test("an OAuth token issued to another client is rejected", async () => {
	const events: UsageEvent[] = [];
	const handler = createMcpV2Handler({
		verifier: oauthVerifier({ clientId: "another_client" }),
		usageRecorder: { record: (event) => events.push(event) },
		resourceMetadataUrl: METADATA_URL,
		toolExecutor: async () => "unused",
	});

	const response = await handler(toolCall("oat_wrong_client"));

	expect(response.status).toBe(401);
	expect(events).toEqual([]);
});

test("an authenticated user can call a real OOXML tool and records identified usage", async () => {
	const events: UsageEvent[] = [];
	const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
	const handler = createMcpV2Handler({
		verifier: oauthVerifier(),
		usageRecorder: { record: (event) => events.push(event) },
		resourceMetadataUrl: METADATA_URL,
		toolExecutor: async (name, args) => {
			calls.push({ name, args });
			return "Element w:p";
		},
		now: () => new Date("2026-08-11T12:30:00.000Z"),
	});

	const response = await handler(toolCall("oat_test", "ooxml_element", { qname: "w:p" }));
	const body = (await response.json()) as {
		result?: { content?: Array<{ text?: string }> };
	};

	expect(response.status).toBe(200);
	expect(body.result?.content?.[0]?.text).toBe("Element w:p");
	expect(calls).toEqual([{ name: "ooxml_element", args: { qname: "w:p" } }]);
	expect(events).toEqual([
		{
			userId: USER_ID,
			tool: "ooxml_element",
			surface: "mcp-v2",
			client: CLIENT_ID,
			occurredAt: "2026-08-11T12:30:00.000Z",
		},
	]);
});

test("a token without the profile scope is rejected", async () => {
	const handler = createMcpV2Handler({
		verifier: oauthVerifier({ scopes: [] }),
		usageRecorder: { record: () => {} },
		resourceMetadataUrl: METADATA_URL,
		toolExecutor: async () => "unused",
	});

	const response = await handler(toolCall("oat_without_scope"));
	expect(response.status).toBe(403);
});

test("a Clerk verification outage returns a server error instead of rejecting the login", async () => {
	const verifier = createClerkOAuthTokenVerifier({
		secretKey: "unused-in-test",
		expectedClientId: CLIENT_ID,
		expectedResourceUrl: RESOURCE_URL,
		accessTokenClient: {
			async verify() {
				throw new Error("Clerk unavailable");
			},
		},
	});
	const handler = createMcpV2Handler({
		verifier,
		usageRecorder: { record: () => {} },
		resourceMetadataUrl: METADATA_URL,
		toolExecutor: async () => "unused",
	});

	const response = await handler(toolCall("oat_during_outage"));
	const body = (await response.json()) as { error?: string };
	expect(response.status).toBe(500);
	expect(body.error).toBe("server_error");
});

test("Clerk Backend API expirations are accepted in seconds or milliseconds", async () => {
	const seconds = Math.floor(Date.now() / 1000) + 300;
	const secondsAuth = await oauthVerifier({ expiration: seconds }).verifyAccessToken("oat_seconds");
	const millisecondsAuth = await oauthVerifier({ expiration: seconds * 1000 }).verifyAccessToken(
		"oat_milliseconds",
	);

	expect(secondsAuth.expiresAt).toBe(seconds);
	expect(millisecondsAuth.expiresAt).toBe(seconds);
});
test("protected resource metadata points MCP clients to Clerk", async () => {
	const response = protectedResourceMetadataResponse(new Request(METADATA_URL), {
		resourceUrl: RESOURCE_URL,
		authorizationServer: AUTHORIZATION_SERVER,
	});
	const body = (await response.json()) as {
		resource?: string;
		authorization_servers?: string[];
		scopes_supported?: string[];
	};

	expect(response.status).toBe(200);
	expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
	expect(body).toMatchObject({
		resource: RESOURCE_URL,
		authorization_servers: [AUTHORIZATION_SERVER],
		scopes_supported: ["profile"],
	});
});
