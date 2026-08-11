/**
 * OOXML Reference MCP Server
 *
 * Cloudflare Worker exposing three tool families over MCP:
 *   - prose search     over ECMA-376 PDFs (ooxml_search, ooxml_section, ooxml_parts)
 *   - schema lookup    over the parsed XSD graph (ooxml_element, ooxml_type,
 *                      ooxml_children, ooxml_attributes, ooxml_enum, ooxml_namespace)
 *   - package metadata curated from Part 1 §11.3.x / §12.3.x / §13.3.x / §15.x
 *                      (ooxml_package_part)
 */

import { type OAuthHelpers, OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createDb } from "./db";
import { embedQuery } from "./embeddings";
import { executeMcpTool } from "./mcp";
import {
	createAuthenticatedMcpHandler,
	createDatabaseUsageRecorder,
	isMcpAuthorizationProps,
	MCP_RESOURCE_URL,
	type McpAuthorizationProps,
} from "./mcp-auth";
import { authenticateClerkUser, handleAuthorizationRequest } from "./oauth-authorization";

export interface Env {
	DATABASE_URL: string;
	VOYAGE_API_KEY: string;
	CLERK_PUBLISHABLE_KEY: string;
	CLERK_SECRET_KEY: string;
	OAUTH_KV: KVNamespace;
	OAUTH_PROVIDER: OAuthHelpers;
}

// Part descriptions
const PART_DESCRIPTIONS: Record<number, string> = {
	1: "Fundamentals and Markup Language Reference",
	2: "Open Packaging Conventions",
	3: "Markup Compatibility and Extensibility",
	4: "Transitional Migration Features",
};

// CORS allowed origins
const ALLOWED_ORIGINS = ["https://ooxml.dev", "https://www.ooxml.dev"];
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function getCorsHeaders(request: Request): Record<string, string> {
	const origin = request.headers.get("Origin");
	if (!origin) return {};

	// Always allow localhost origins (safe - can only be used when running locally)
	const allowedOrigins = [...ALLOWED_ORIGINS, ...DEV_ORIGINS];

	if (allowedOrigins.includes(origin)) {
		return {
			"Access-Control-Allow-Origin": origin,
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers":
				"Authorization, Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
		};
	}

	return {};
}

function addCorsHeaders(response: Response, corsHeaders: Record<string, string>): Response {
	if (Object.keys(corsHeaders).length === 0) return response;

	const newHeaders = new Headers(response.headers);
	for (const [key, value] of Object.entries(corsHeaders)) {
		newHeaders.set(key, value);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	});
}

type OAuthExecutionContext = ExecutionContext & { props?: McpAuthorizationProps };

const mcpApiHandler = {
	async fetch(request: Request, env: Env, context: ExecutionContext) {
		if (new URL(request.url).pathname !== "/mcp") return new Response("Not found", { status: 404 });

		const props = (context as OAuthExecutionContext).props;
		if (!isMcpAuthorizationProps(props)) {
			console.error("OAuth provider did not supply valid MCP authorization props");
			return new Response("Authenticated identity is unavailable", { status: 500 });
		}

		const handler = createAuthenticatedMcpHandler({
			usageRecorder: createDatabaseUsageRecorder(env.DATABASE_URL),
			toolExecutor: (name, args) => executeMcpTool(name, args, env),
		});
		return addCorsHeaders(await handler(request, props), getCorsHeaders(request));
	},
} satisfies ExportedHandler<Env>;

const defaultHandler = {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		const corsHeaders = getCorsHeaders(request);

		console.log("incoming request", {
			method: request.method,
			path: url.pathname,
			origin: request.headers.get("Origin") || "none",
			referer: request.headers.get("Referer") || "none",
			userAgent: request.headers.get("User-Agent") || "none",
			ip: request.headers.get("CF-Connecting-IP") || "unknown",
			country: request.headers.get("CF-IPCountry") || "unknown",
			host: request.headers.get("Host") || "unknown",
		});

		if (url.pathname === "/authorize") {
			return handleAuthorizationRequest(request, {
				oauth: env.OAUTH_PROVIDER,
				authenticateUser: (authorizationRequest) =>
					authenticateClerkUser(authorizationRequest, env),
			});
		}

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders });
		}

		if (url.pathname === "/health") {
			return addCorsHeaders(Response.json({ status: "ok" }), corsHeaders);
		}

		if (url.pathname === "/search" && request.method === "POST") {
			return addCorsHeaders(await handleSearch(request, env), corsHeaders);
		}

		if (url.pathname === "/section" && request.method === "GET") {
			return addCorsHeaders(await handleGetSection(request, env), corsHeaders);
		}

		if (url.pathname === "/stats") {
			return addCorsHeaders(await handleStats(env), corsHeaders);
		}

		return addCorsHeaders(
			Response.json({
				name: "OOXML Reference MCP Server",
				version: "0.1.0",
				endpoints: {
					mcp: "/mcp",
					health: "/health",
					search: "POST /search",
					section: "GET /section?id=17.3.2&part=1",
					stats: "/stats",
				},
			}),
			corsHeaders,
		);
	},
} satisfies ExportedHandler<Env>;

export default new OAuthProvider<Env>({
	apiRoute: "/mcp",
	apiHandler: mcpApiHandler,
	defaultHandler,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/oauth/token",
	clientRegistrationEndpoint: "/oauth/register",
	clientIdMetadataDocumentEnabled: true,
	scopesSupported: ["profile"],
	resourceMetadata: {
		resource: MCP_RESOURCE_URL,
		scopes_supported: ["profile"],
		resource_name: "OOXML Reference MCP Server",
	},
});

// REST API handlers for testing
async function handleSearch(request: Request, env: Env): Promise<Response> {
	try {
		const body = (await request.json()) as { query: string; part?: number; limit?: number };
		const { query, part, limit = 5 } = body;

		if (!query) {
			return new Response(JSON.stringify({ error: "Missing query" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const db = createDb(env.DATABASE_URL);
		const embedding = await embedQuery(query, env.VOYAGE_API_KEY);
		const results = await db.search(embedding, { limit, partNumber: part });

		return new Response(JSON.stringify({ query, results }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}

async function handleGetSection(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const sectionId = url.searchParams.get("id");
	const part = url.searchParams.get("part");

	if (!sectionId) {
		return new Response(JSON.stringify({ error: "Missing id parameter" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const db = createDb(env.DATABASE_URL);
	const results = await db.getBySection(sectionId, part ? parseInt(part, 10) : undefined);

	return new Response(JSON.stringify({ sectionId, part, results }), {
		headers: { "Content-Type": "application/json" },
	});
}

async function handleStats(env: Env): Promise<Response> {
	const db = createDb(env.DATABASE_URL);
	const stats = await db.getStats();

	return new Response(
		JSON.stringify({
			...stats,
			parts: PART_DESCRIPTIONS,
		}),
		{
			headers: { "Content-Type": "application/json" },
		},
	);
}
