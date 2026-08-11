import { expect, test } from "bun:test";
import {
	createAuthenticatedMcpHandler,
	isMcpAuthorizationProps,
	MCP_PROTOCOL_VERSION,
	MCP_RESOURCE_URL,
	type McpAuthorizationProps,
	type UsageEvent,
} from "../../apps/mcp-server/src/mcp-auth.ts";

const USER_ID = "user_test_mcp";
const CLIENT_ID = "dynamic_client_test";

const identity: McpAuthorizationProps = {
	userId: USER_ID,
	clientId: CLIENT_ID,
	scopes: ["profile"],
};

function modernRequest(method: string, params: Record<string, unknown>): Request {
	const headers = new Headers({
		Authorization: "Bearer test-provider-token",
		"Content-Type": "application/json",
		"MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
		"Mcp-Method": method,
	});
	if (typeof params.name === "string") headers.set("Mcp-Name", params.name);

	return new Request(MCP_RESOURCE_URL, {
		method: "POST",
		headers,
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method,
			params: {
				...params,
				_meta: {
					"io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
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

function legacyInitializeRequest(): Request {
	return new Request(MCP_RESOURCE_URL, {
		method: "POST",
		headers: {
			Accept: "application/json, text/event-stream",
			Authorization: "Bearer test-provider-token",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "codex-mcp-client", version: "0.147.0" },
			},
		}),
	});
}

test("an OAuth provider identity reaches a real OOXML tool and records identified use", async () => {
	expect(MCP_PROTOCOL_VERSION).toBe("2026-07-28");
	expect(MCP_RESOURCE_URL).toBe("https://api.ooxml.dev/mcp");
	const events: UsageEvent[] = [];
	const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
	const handler = createAuthenticatedMcpHandler({
		usageRecorder: { record: (event) => events.push(event) },
		toolExecutor: async (name, args) => {
			calls.push({ name, args });
			return "Element w:p";
		},
		now: () => new Date("2026-08-11T12:30:00.000Z"),
	});

	const response = await handler(
		modernRequest("tools/call", {
			name: "ooxml_element",
			arguments: { qname: "w:p" },
		}),
		identity,
	);
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
			surface: "mcp",
			client: CLIENT_ID,
			occurredAt: "2026-08-11T12:30:00.000Z",
		},
	]);
});

test("authenticated tools/list exposes only the public OOXML tools", async () => {
	const handler = createAuthenticatedMcpHandler({
		usageRecorder: { record: () => {} },
		toolExecutor: async () => "unused",
	});

	const response = await handler(modernRequest("tools/list", {}), identity);
	const body = (await response.json()) as { result?: { tools?: Array<{ name: string }> } };
	const names = body.result?.tools?.map((tool) => tool.name) ?? [];

	expect(response.status).toBe(200);
	expect(names).toContain("ooxml_element");
	expect(names).not.toContain("ooxml_whoami");
});

test("authenticated MCP 2024-11-05 clients can initialize through the compatibility path", async () => {
	const handler = createAuthenticatedMcpHandler({
		usageRecorder: { record: () => {} },
		toolExecutor: async () => "unused",
	});

	const response = await handler(legacyInitializeRequest(), identity);
	const event = await response.text();
	const data = event
		.split("\n")
		.find((line) => line.startsWith("data: "))
		?.slice("data: ".length);
	const body = JSON.parse(data ?? "{}") as {
		result?: { protocolVersion?: string; serverInfo?: { name?: string } };
	};

	expect(response.status).toBe(200);
	expect(response.headers.get("Content-Type")).toContain("text/event-stream");
	expect(body.result?.protocolVersion).toBe("2024-11-05");
	expect(body.result?.serverInfo?.name).toBe("ooxml");
});

test("OAuth token props must include Clerk user, dynamic client, and scopes", () => {
	expect(isMcpAuthorizationProps(identity)).toBe(true);
	expect(isMcpAuthorizationProps({ userId: USER_ID, clientId: CLIENT_ID })).toBe(false);
	expect(isMcpAuthorizationProps({ userId: USER_ID, clientId: 123, scopes: [] })).toBe(false);
});
