import { expect, test } from "bun:test";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import {
	createClerkTokenVerifier,
	createMcpV2Handler,
	MCP_V2_PROTOCOL_VERSION,
	MCP_V2_TOOL_NAME,
	type UsageEvent,
} from "../../apps/mcp-server/src/mcp-v2.ts";

const AUTHORIZED_PARTY = "http://localhost:8787";
const USER_ID = "user_test_mcp_v2";

async function signedClerkToken(authorizedParty = AUTHORIZED_PARTY) {
	const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
	const jwtKey = await exportSPKI(publicKey);
	const now = Math.floor(Date.now() / 1000);
	const token = await new SignJWT({
		sub: USER_ID,
		sid: "sess_test_mcp_v2",
		azp: authorizedParty,
	})
		.setProtectedHeader({ alg: "RS256", kid: "test-key" })
		.setIssuer("https://clerk.test")
		.setIssuedAt(now)
		.setExpirationTime(now + 300)
		.sign(privateKey);

	return { jwtKey, token };
}

function toolCall(token?: string): Request {
	const headers = new Headers({
		"Content-Type": "application/json",
		"MCP-Protocol-Version": MCP_V2_PROTOCOL_VERSION,
		"Mcp-Method": "tools/call",
		"Mcp-Name": MCP_V2_TOOL_NAME,
	});
	if (token) headers.set("Authorization", `Bearer ${token}`);

	return new Request("http://localhost:8787/mcp-v2", {
		method: "POST",
		headers,
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: {
				name: MCP_V2_TOOL_NAME,
				arguments: {},
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

test("a verified Clerk identity reaches an MCP 2026-07-28 tool and usage recorder", async () => {
	expect(MCP_V2_PROTOCOL_VERSION).toBe("2026-07-28");
	const { jwtKey, token } = await signedClerkToken();
	const events: UsageEvent[] = [];
	const handler = createMcpV2Handler({
		verifier: createClerkTokenVerifier({
			jwtKey,
			authorizedParties: [AUTHORIZED_PARTY],
		}),
		usageRecorder: { record: (event) => events.push(event) },
		now: () => new Date("2026-08-11T12:00:00.000Z"),
	});

	const response = await handler(toolCall(token));
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
			client: AUTHORIZED_PARTY,
			occurredAt: "2026-08-11T12:00:00.000Z",
		},
	]);
});

test("the MCP v2 route rejects a missing bearer token", async () => {
	const { jwtKey } = await signedClerkToken();
	const handler = createMcpV2Handler({
		verifier: createClerkTokenVerifier({ jwtKey }),
		usageRecorder: { record: () => {} },
	});

	const response = await handler(toolCall());

	expect(response.status).toBe(401);
	expect(response.headers.get("WWW-Authenticate")).toContain("Bearer");
});

test("the MCP v2 route rejects a token from another authorized party", async () => {
	const { jwtKey, token } = await signedClerkToken("https://other.example");
	const events: UsageEvent[] = [];
	const handler = createMcpV2Handler({
		verifier: createClerkTokenVerifier({
			jwtKey,
			authorizedParties: [AUTHORIZED_PARTY],
		}),
		usageRecorder: { record: (event) => events.push(event) },
	});

	const response = await handler(toolCall(token));

	expect(response.status).toBe(401);
	expect(events).toEqual([]);
});
