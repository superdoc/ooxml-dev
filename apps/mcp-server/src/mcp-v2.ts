import { verifyToken } from "@clerk/backend";
import {
	createMcpHandler,
	McpServer,
	OAuthError,
	OAuthErrorCode,
	type OAuthTokenVerifier,
	requireBearerAuth,
} from "@modelcontextprotocol/server";
import { z } from "zod";

export const MCP_V2_PROTOCOL_VERSION = "2026-07-28";
export const MCP_V2_TOOL_NAME = "ooxml_whoami";

export interface UsageEvent {
	userId: string;
	tool: typeof MCP_V2_TOOL_NAME;
	surface: "mcp-v2";
	client: string;
	occurredAt: string;
}

export interface UsageRecorder {
	record(event: UsageEvent): void | Promise<void>;
}

interface ClerkVerifierOptions {
	secretKey?: string;
	jwtKey?: string;
	authorizedParties?: string[];
}

interface McpV2Options {
	verifier: OAuthTokenVerifier;
	usageRecorder: UsageRecorder;
	now?: () => Date;
}

/**
 * Keep Clerk at the authentication boundary so the MCP handler only receives
 * an already-verified user identity. The token itself is never recorded.
 */
export function createClerkTokenVerifier(options: ClerkVerifierOptions): OAuthTokenVerifier {
	return {
		async verifyAccessToken(token) {
			try {
				const payload = await verifyToken(token, options);
				if (!payload.sub || !payload.exp) {
					throw new Error("Clerk token is missing sub or exp");
				}

				return {
					token,
					clientId: typeof payload.azp === "string" ? payload.azp : "clerk",
					scopes: [],
					expiresAt: payload.exp,
					extra: { userId: payload.sub },
				};
			} catch {
				throw new OAuthError(OAuthErrorCode.InvalidToken, "The Clerk token is invalid or expired");
			}
		},
	};
}

export function createConsoleUsageRecorder(): UsageRecorder {
	return {
		record(event) {
			console.info("mcp usage", event);
		},
	};
}

/**
 * This route is intentionally separate from /mcp until the authenticated v2
 * path has been exercised with a real Clerk-issued token.
 */
export function createMcpV2Handler(options: McpV2Options): (request: Request) => Promise<Response> {
	const now = options.now ?? (() => new Date());
	const authGate = requireBearerAuth({ verifier: options.verifier });
	const handler = createMcpHandler(
		() => {
			const server = new McpServer({ name: "ooxml", version: "0.1.0" });

			server.registerTool(
				MCP_V2_TOOL_NAME,
				{
					description: "Confirm the current Clerk identity and record one authenticated MCP use.",
					inputSchema: z.object({}),
				},
				async (_args, context) => {
					const authInfo = context.http?.authInfo;
					const userId = authInfo?.extra?.userId;
					if (!authInfo || typeof userId !== "string") {
						throw new Error("Authenticated Clerk user ID is missing from the MCP request context");
					}

					await options.usageRecorder.record({
						userId,
						tool: MCP_V2_TOOL_NAME,
						surface: "mcp-v2",
						client: authInfo.clientId,
						occurredAt: now().toISOString(),
					});

					return {
						content: [{ type: "text", text: `Authenticated as ${userId}` }],
					};
				},
			);

			return server;
		},
		{ legacy: "reject" },
	);

	return async (request) => {
		const auth = await authGate(request);
		if (auth instanceof Response) return auth;
		return handler.fetch(request, { authInfo: auth });
	};
}
