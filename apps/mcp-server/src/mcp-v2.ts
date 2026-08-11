import { createClerkClient } from "@clerk/backend";
import {
	createMcpHandler,
	getOAuthProtectedResourceMetadataUrl,
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
	secretKey: string;
	expectedClientId: string;
	expectedResourceUrl: string;
	accessTokenClient?: ClerkOAuthAccessTokenClient;
}

interface McpV2Options {
	verifier: OAuthTokenVerifier;
	usageRecorder: UsageRecorder;
	resourceMetadataUrl: string;
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
 * Clerk OAuth access tokens are opaque, so verification happens through the
 * Backend API. The MCP handler only receives the verified identity; the token
 * itself is never recorded.
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
				if (
					verified.revoked ||
					verified.expired ||
					!verified.expiration ||
					verified.clientId !== options.expectedClientId ||
					!hasJwtAudience(token, options.expectedResourceUrl)
				) {
					throw new Error(
						"Clerk OAuth token is expired, revoked, or issued to another client or resource",
					);
				}

				return {
					token,
					clientId: verified.clientId,
					scopes: verified.scopes,
					expiresAt: Math.floor(verified.expiration / 1000),
					resource: new URL(options.expectedResourceUrl),
					extra: { userId: verified.subject },
				};
			} catch {
				throw new OAuthError(
					OAuthErrorCode.InvalidToken,
					"The Clerk OAuth token is invalid or expired",
				);
			}
		},
	};
}

function hasJwtAudience(token: string, expectedResourceUrl: string): boolean {
	const payloadPart = token.split(".")[1];
	if (!payloadPart) return false;

	try {
		const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
		const payload = JSON.parse(atob(padded)) as { aud?: string | string[] };
		return Array.isArray(payload.aud)
			? payload.aud.includes(expectedResourceUrl)
			: payload.aud === expectedResourceUrl;
	} catch {
		return false;
	}
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

/**
 * This route is intentionally separate from /mcp until the authenticated v2
 * path has been exercised with a real Clerk-issued token.
 */
export function createMcpV2Handler(options: McpV2Options): (request: Request) => Promise<Response> {
	const now = options.now ?? (() => new Date());
	const authGate = requireBearerAuth({
		verifier: options.verifier,
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
