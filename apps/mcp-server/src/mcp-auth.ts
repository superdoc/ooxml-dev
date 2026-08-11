import { type AuthInfo, createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { ALL_TOOL_DEFS, type ToolDef } from "./mcp";

export const MCP_PROTOCOL_VERSION = "2026-07-28";
export const MCP_RESOURCE_URL = "https://api.ooxml.dev/mcp";

export interface McpAuthorizationProps {
	userId: string;
	clientId: string;
	scopes: string[];
}

export interface UsageEvent {
	userId: string;
	tool: string;
	surface: "mcp";
	client: string;
	occurredAt: string;
}

export interface UsageRecorder {
	record(event: UsageEvent): void | Promise<void>;
}

interface AuthenticatedMcpOptions {
	usageRecorder: UsageRecorder;
	toolExecutor: (name: string, args: Record<string, unknown>) => Promise<string>;
	now?: () => Date;
	waitUntil?: (promise: Promise<void>) => void;
	onUsageError?: (error: unknown) => void;
}

type ToolProperty = {
	type: "string" | "number";
	description?: string;
};

function inputSchemaFor(tool: ToolDef): z.ZodObject<Record<string, z.ZodType>> {
	const required = new Set(tool.inputSchema.required ?? []);
	const shape: Record<string, z.ZodType> = {};

	for (const [name, rawProperty] of Object.entries(tool.inputSchema.properties)) {
		const property = rawProperty as ToolProperty;
		let schema: z.ZodType = property.type === "number" ? z.number() : z.string();
		if (property.description) schema = schema.describe(property.description);
		shape[name] = required.has(name) ? schema : schema.optional();
	}

	return z.object(shape);
}

function authenticatedIdentity(authInfo: AuthInfo | undefined): McpAuthorizationProps {
	const userId = authInfo?.extra?.userId;
	if (!authInfo || typeof userId !== "string") {
		throw new Error("Authenticated Clerk user ID is missing from the MCP request context");
	}

	return { userId, clientId: authInfo.clientId, scopes: authInfo.scopes };
}

export function isMcpAuthorizationProps(value: unknown): value is McpAuthorizationProps {
	if (!value || typeof value !== "object") return false;
	const props = value as Partial<McpAuthorizationProps>;
	return (
		typeof props.userId === "string" &&
		typeof props.clientId === "string" &&
		Array.isArray(props.scopes) &&
		props.scopes.every((scope) => typeof scope === "string")
	);
}

export function createDatabaseUsageRecorder(connectionString: string): UsageRecorder {
	const sql = neon(connectionString);
	return {
		async record(event) {
			await sql`
				INSERT INTO mcp_usage_events
					(clerk_user_id, oauth_client_id, tool_name, surface, occurred_at)
				VALUES
					(${event.userId}, ${event.client}, ${event.tool}, ${event.surface}, ${event.occurredAt})
			`;
			console.info("mcp usage", event);
		},
	};
}

function recordUsage(options: AuthenticatedMcpOptions, event: UsageEvent): void {
	const reportError = (error: unknown) => {
		if (options.onUsageError) options.onUsageError(error);
		else console.error("Failed to record MCP usage", error);
	};

	let recording: void | Promise<void>;
	try {
		recording = options.usageRecorder.record(event);
	} catch (error) {
		reportError(error);
		return;
	}

	const completed = Promise.resolve(recording).catch(reportError);
	options.waitUntil?.(completed);
}

export function createAuthenticatedMcpHandler(options: AuthenticatedMcpOptions) {
	const now = options.now ?? (() => new Date());
	const handler = createMcpHandler(
		({ authInfo }) => {
			const identity = authenticatedIdentity(authInfo);
			const server = new McpServer({ name: "ooxml", version: "0.1.0" });

			for (const tool of ALL_TOOL_DEFS) {
				server.registerTool(
					tool.name,
					{
						description: tool.description,
						inputSchema: inputSchemaFor(tool),
					},
					async (args) => {
						const text = await options.toolExecutor(tool.name, args);
						recordUsage(options, {
							userId: identity.userId,
							tool: tool.name,
							surface: "mcp",
							client: identity.clientId,
							occurredAt: now().toISOString(),
						});
						return { content: [{ type: "text", text }] };
					},
				);
			}

			return server;
		},
		// Keep current clients working while the same factory serves MCP 2026-07-28.
		{ legacy: "stateless" },
	);

	return (request: Request, props: McpAuthorizationProps) => {
		const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
		return handler.fetch(request, {
			authInfo: {
				token,
				clientId: props.clientId,
				scopes: props.scopes,
				resource: new URL(MCP_RESOURCE_URL),
				extra: { userId: props.userId },
			},
		});
	};
}
