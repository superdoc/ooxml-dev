import { createClerkClient } from "@clerk/backend";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import {
	createMcpHandler,
	getOAuthProtectedResourceMetadataUrl,
	McpServer,
	OAuthError,
	OAuthErrorCode,
	type OAuthTokenVerifier,
	requireBearerAuth,
} from "@modelcontextprotocol/server";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { ALL_TOOL_DEFS, type ToolDef } from "./mcp";

export const MCP_V2_PROTOCOL_VERSION = "2026-07-28";
export const MCP_V2_TOOL_NAME = "ooxml_whoami";

export interface UsageEvent {
	userId: string;
	tool: string;
	surface: "mcp-v2";
	client: string;
	occurredAt: string;
}

export interface UsageRecorder {
	record(event: UsageEvent): void | Promise<void>;
}

interface ClerkVerifierOptions {
	secretKey: string;
	expectedClientId: string;
	expectedResourceUrl: string;
	accessTokenClient?: ClerkOAuthAccessTokenClient;
}

interface McpV2Options {
	verifier: OAuthTokenVerifier;
	usageRecorder: UsageRecorder;
	resourceMetadataUrl: string;
	toolExecutor: (name: string, args: Record<string, unknown>) => Promise<string>;
	now?: () => Date;
}

interface ClerkOAuthAccessToken {
	clientId: string;
	subject: string;
	scopes: string[];
	revoked: boolean;
	expired: boolean;
	expiration: number | null;
}

interface ClerkOAuthAccessTokenClient {
	verify(token: string): Promise<ClerkOAuthAccessToken>;
}

/**
 * Clerk currently ignores RFC 8707 `resource` when issuing OAuth tokens, so
 * it does not emit an `aud` claim the resource server can validate. This MVP
 * binds one dedicated Clerk client ID to one configured MCP resource instead.
 * Do not reuse that OAuth client for another resource. The token is verified
 * by Clerk and is never recorded.
 */

export function createClerkOAuthTokenVerifier(options: ClerkVerifierOptions): OAuthTokenVerifier {
	const accessTokenClient =
		options.accessTokenClient ??
		createClerkClient({
			secretKey: options.secretKey,
			telemetry: { disabled: true },
		}).idPOAuthAccessToken;

	return {
		async verifyAccessToken(token) {
			try {
				const verified = await accessTokenClient.verify(token);
				const expiresAt = tokenExpirationSeconds(token, verified.expiration);
				if (
					verified.revoked ||
					verified.expired ||
					!expiresAt ||
					verified.clientId !== options.expectedClientId
				) {
					throw new OAuthError(
						OAuthErrorCode.InvalidToken,
						"The Clerk OAuth token is expired, revoked, or issued to another client",
					);
				}

				return {
					token,
					clientId: verified.clientId,
					scopes: verified.scopes,
					expiresAt,
					resource: new URL(options.expectedResourceUrl),
					extra: { userId: verified.subject },
				};
			} catch (error) {
				if (error instanceof OAuthError) throw error;
				if (!isClerkAPIResponseError(error) || error.status >= 500) {
					throw new OAuthError(
						OAuthErrorCode.ServerError,
						"Clerk token verification is temporarily unavailable",
					);
				}
				throw new OAuthError(
					OAuthErrorCode.InvalidToken,
					"The Clerk OAuth token is invalid or expired",
				);
			}
		},
	};
}

function tokenExpirationSeconds(
	token: string,
	verifiedExpiration: number | null,
): number | undefined {
	const payloadPart = token.split(".")[1];
	if (payloadPart) {
		try {
			const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString()) as {
				exp?: unknown;
			};
			if (typeof claims.exp === "number") return claims.exp;
		} catch {
			// Opaque tokens use the verified Backend API expiration below.
		}
	}

	if (!verifiedExpiration) return undefined;
	return Math.floor(
		verifiedExpiration > 10_000_000_000 ? verifiedExpiration / 1000 : verifiedExpiration,
	);
}

export function protectedResourceMetadataUrl(resourceUrl: string): string {
	return getOAuthProtectedResourceMetadataUrl(new URL(resourceUrl));
}

export function protectedResourceMetadataResponse(
	request: Request,
	options: { resourceUrl: string; authorizationServer: string },
): Response {
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: oauthMetadataCorsHeaders() });
	}

	if (request.method !== "GET") {
		return new Response("Method not allowed", {
			status: 405,
			headers: { ...oauthMetadataCorsHeaders(), Allow: "GET, OPTIONS" },
		});
	}

	return Response.json(
		{
			resource: options.resourceUrl,
			authorization_servers: [options.authorizationServer],
			scopes_supported: ["profile"],
			token_types_supported: ["urn:ietf:params:oauth:token-type:access_token"],
			jwks_uri: `${options.authorizationServer}/.well-known/jwks.json`,
			service_documentation: "https://ooxml.dev",
		},
		{ headers: oauthMetadataCorsHeaders() },
	);
}

function oauthMetadataCorsHeaders(): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "*",
		"Access-Control-Max-Age": "86400",
	};
}

export function createConsoleUsageRecorder(): UsageRecorder {
	return {
		record(event) {
			console.info("mcp usage", event);
		},
	};
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

function authenticatedIdentity(context: {
	http?: { authInfo?: { clientId: string; extra?: Record<string, unknown> } };
}): { userId: string; clientId: string } {
	const authInfo = context.http?.authInfo;
	const userId = authInfo?.extra?.userId;
	if (!authInfo || typeof userId !== "string") {
		throw new Error("Authenticated Clerk user ID is missing from the MCP request context");
	}
	return { userId, clientId: authInfo.clientId };
}

/**
 * This route is intentionally separate from /mcp until the authenticated v2
 * path has been exercised with a real Clerk-issued token.
 */
export function createMcpV2Handler(options: McpV2Options): (request: Request) => Promise<Response> {
	const now = options.now ?? (() => new Date());
	const authGate = requireBearerAuth({
		verifier: options.verifier,
		requiredScopes: ["profile"],
		resourceMetadataUrl: options.resourceMetadataUrl,
	});
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
					const identity = authenticatedIdentity(context);

					await options.usageRecorder.record({
						userId: identity.userId,
						tool: MCP_V2_TOOL_NAME,
						surface: "mcp-v2",
						client: identity.clientId,
						occurredAt: now().toISOString(),
					});

					return {
						content: [{ type: "text", text: `Authenticated as ${identity.userId}` }],
					};
				},
			);

			for (const tool of ALL_TOOL_DEFS) {
				server.registerTool(
					tool.name,
					{
						description: tool.description,
						inputSchema: inputSchemaFor(tool),
					},
					async (args, context) => {
						const identity = authenticatedIdentity(context);
						const text = await options.toolExecutor(tool.name, args);
						await options.usageRecorder.record({
							userId: identity.userId,
							tool: tool.name,
							surface: "mcp-v2",
							client: identity.clientId,
							occurredAt: now().toISOString(),
						});
						return { content: [{ type: "text", text }] };
					},
				);
			}

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
