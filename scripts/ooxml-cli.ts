#!/usr/bin/env bun

import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MCP_V2_PROTOCOL_VERSION } from "../apps/mcp-server/src/mcp-v2";

const CLIENT_ID = process.env.CLERK_OAUTH_CLIENT_ID ?? "ywoNOfxsoQ8Dw1FW";
const AUTHORIZATION_SERVER =
	process.env.CLERK_OAUTH_ISSUER ?? "https://glad-beetle-33.clerk.accounts.dev";
const MCP_URL = process.env.OOXML_MCP_URL ?? "https://api.ooxml.dev/mcp-v2";
const CALLBACK_URL = "http://127.0.0.1:45879/callback";

interface OAuthMetadata {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	revocation_endpoint?: string;
	code_challenge_methods_supported: string[];
}

interface StoredTokens {
	version: 1;
	issuer: string;
	clientId: string;
	resource: string;
	accessToken: string;
	refreshToken?: string;
	expiresAt?: number;
}

interface TokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
	const [command, ...rest] = args;

	switch (command) {
		case "login": {
			const tokens = await login();
			await saveTokens(tokens);
			console.log(await callTool(tokens.accessToken, "ooxml_whoami", {}));
			return;
		}
		case "logout":
			await logout();
			return;
		case "whoami":
			console.log(await withAccessToken((token) => callTool(token, "ooxml_whoami", {})));
			return;
		case "tools": {
			const result = await withAccessToken((token) => mcpRequest(token, "tools/list", {}));
			const tools = result.tools as Array<{ name?: string; description?: string }> | undefined;
			if (!tools) throw new Error("MCP tools/list returned no tools");
			for (const tool of tools) console.log(`${tool.name}\t${tool.description ?? ""}`);
			return;
		}
		case "call": {
			const [toolName, json = "{}"] = rest;
			if (!toolName) throw new Error('Usage: ooxml call <tool> [\'{"arg":"value"}\']');
			const parsed = JSON.parse(json) as unknown;
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				throw new Error("Tool arguments must be a JSON object");
			}
			console.log(
				await withAccessToken((token) =>
					callTool(token, toolName, parsed as Record<string, unknown>),
				),
			);
			return;
		}
		case undefined:
		case "help":
		case "--help":
		case "-h":
			printHelp();
			return;
		default:
			throw new Error(`Unknown command: ${command}. Run 'ooxml help'.`);
	}
}

async function fetchMetadata(): Promise<OAuthMetadata> {
	const response = await fetch(`${AUTHORIZATION_SERVER}/.well-known/oauth-authorization-server`);
	const metadata = (await response.json()) as Partial<OAuthMetadata>;
	if (
		!response.ok ||
		metadata.issuer !== AUTHORIZATION_SERVER ||
		!metadata.authorization_endpoint ||
		!metadata.token_endpoint
	) {
		throw new Error("Clerk OAuth metadata is missing or has the wrong issuer");
	}
	if (!metadata.code_challenge_methods_supported?.includes("S256")) {
		throw new Error("Clerk does not advertise the required S256 PKCE method");
	}
	return metadata as OAuthMetadata;
}

async function login(): Promise<StoredTokens> {
	const metadata = await fetchMetadata();
	const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
	const challenge = base64Url(
		new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
	);
	const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
	const authorizationUrl = new URL(metadata.authorization_endpoint);
	authorizationUrl.search = new URLSearchParams({
		response_type: "code",
		client_id: CLIENT_ID,
		redirect_uri: CALLBACK_URL,
		scope: "profile offline_access",
		state,
		code_challenge: challenge,
		code_challenge_method: "S256",
		resource: MCP_URL,
	}).toString();

	let completeCallback: (value: { code: string } | { error: Error }) => void = () => {};
	const callback = new Promise<{ code: string } | { error: Error }>((resolve) => {
		completeCallback = resolve;
	});
	let server: ReturnType<typeof Bun.serve>;
	try {
		server = Bun.serve({
			hostname: "127.0.0.1",
			port: 45879,
			fetch(request) {
				const url = new URL(request.url);
				if (url.pathname !== "/callback") return new Response("Not found", { status: 404 });

				const returnedState = url.searchParams.get("state");
				const returnedIssuer = url.searchParams.get("iss");
				if (
					returnedState !== state ||
					(returnedIssuer !== null && returnedIssuer !== AUTHORIZATION_SERVER)
				) {
					return new Response("Invalid OAuth callback.", { status: 400 });
				}

				const oauthError = url.searchParams.get("error");
				if (oauthError) {
					completeCallback({ error: new Error(`Clerk authorization failed: ${oauthError}`) });
					return new Response("Authorization failed. You can close this tab.", { status: 400 });
				}

				const code = url.searchParams.get("code");
				if (!code) return new Response("Invalid OAuth callback.", { status: 400 });
				completeCallback({ code });
				return new Response("OOXML CLI is connected. You can close this tab.", {
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			},
		});
	} catch {
		throw new Error("Could not open the OAuth callback on 127.0.0.1:45879. Is it in use?");
	}

	console.log("Opening Clerk sign-in in your browser...");
	await openBrowser(authorizationUrl.toString());

	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		const result = await Promise.race([
			callback,
			new Promise<{ error: Error }>((resolve) => {
				timeout = setTimeout(
					() => resolve({ error: new Error("Clerk authorization timed out") }),
					300_000,
				);
			}),
		]);
		if ("error" in result) throw result.error;

		const tokenResponse = await fetch(metadata.token_endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				client_id: CLIENT_ID,
				code: result.code,
				redirect_uri: CALLBACK_URL,
				code_verifier: verifier,
				resource: MCP_URL,
			}),
		});
		return storedTokens(await readTokenResponse(tokenResponse));
	} finally {
		if (timeout) clearTimeout(timeout);
		server.stop(true);
	}
}

async function withAccessToken<T>(callback: (token: string) => Promise<T>): Promise<T> {
	let tokens = await loadTokens();
	if (!tokens) throw new Error("Not signed in. Run 'ooxml login'.");

	if (tokens.expiresAt && tokens.expiresAt <= Math.floor(Date.now() / 1000) + 30) {
		tokens = await refresh(tokens);
	}
	return callback(tokens.accessToken);
}

async function refresh(tokens: StoredTokens): Promise<StoredTokens> {
	if (!tokens.refreshToken) throw new Error("Your login expired. Run 'ooxml login' again.");
	const metadata = await fetchMetadata();
	const response = await fetch(metadata.token_endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			client_id: CLIENT_ID,
			refresh_token: tokens.refreshToken,
			resource: MCP_URL,
		}),
	});
	const next = storedTokens(await readTokenResponse(response), tokens.refreshToken);
	await saveTokens(next);
	return next;
}

async function readTokenResponse(response: Response): Promise<TokenResponse> {
	const body = (await response.json()) as TokenResponse;
	if (!response.ok || !body.access_token) {
		throw new Error(body.error_description ?? body.error ?? "Clerk token exchange failed");
	}
	return body;
}

function storedTokens(body: TokenResponse, previousRefreshToken?: string): StoredTokens {
	const accessToken = body.access_token;
	if (!accessToken) throw new Error("Clerk token exchange returned no access token");
	return {
		version: 1,
		issuer: AUTHORIZATION_SERVER,
		clientId: CLIENT_ID,
		resource: MCP_URL,
		accessToken,
		refreshToken: body.refresh_token ?? previousRefreshToken,
		expiresAt: tokenExpiration(accessToken, body.expires_in),
	};
}

function tokenExpiration(token: string, expiresIn?: number): number | undefined {
	const payload = token.split(".")[1];
	if (payload) {
		try {
			const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: unknown };
			if (typeof claims.exp === "number") return claims.exp;
		} catch {
			// Opaque tokens rely on expires_in below.
		}
	}
	return typeof expiresIn === "number" ? Math.floor(Date.now() / 1000) + expiresIn : undefined;
}

async function mcpRequest(
	token: string,
	method: string,
	params: Record<string, unknown>,
	toolName?: string,
): Promise<Record<string, unknown>> {
	const headers = new Headers({
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
		"MCP-Protocol-Version": MCP_V2_PROTOCOL_VERSION,
		"Mcp-Method": method,
	});
	if (toolName) headers.set("Mcp-Name", toolName);

	const response = await fetch(MCP_URL, {
		method: "POST",
		headers,
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method,
			params: {
				...params,
				_meta: {
					"io.modelcontextprotocol/protocolVersion": MCP_V2_PROTOCOL_VERSION,
					"io.modelcontextprotocol/clientInfo": { name: "ooxml-cli", version: "0.1.0" },
					"io.modelcontextprotocol/clientCapabilities": {},
				},
			},
		}),
	});
	const body = (await response.json()) as {
		result?: Record<string, unknown>;
		error?: string | { message?: string };
		error_description?: string;
	};
	if (!response.ok || !body.result) {
		const rpcMessage = typeof body.error === "object" ? body.error.message : body.error;
		throw new Error(
			body.error_description ?? rpcMessage ?? `MCP request failed: HTTP ${response.status}`,
		);
	}
	return body.result;
}

async function callTool(
	token: string,
	name: string,
	args: Record<string, unknown>,
): Promise<string> {
	const result = await mcpRequest(token, "tools/call", { name, arguments: args }, name);
	const content = result.content as Array<{ text?: string }> | undefined;
	return content?.[0]?.text ?? "Tool call completed.";
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
	const path = authFile();
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`;
	await writeFile(temporaryPath, `${JSON.stringify(tokens)}\n`, { mode: 0o600 });
	await rename(temporaryPath, path);
	await chmod(path, 0o600);
}

async function loadTokens(): Promise<StoredTokens | null> {
	try {
		const tokens = JSON.parse(await readFile(authFile(), "utf8")) as StoredTokens;
		if (
			tokens.version !== 1 ||
			tokens.issuer !== AUTHORIZATION_SERVER ||
			tokens.clientId !== CLIENT_ID ||
			tokens.resource !== MCP_URL
		) {
			throw new Error("Saved login belongs to another OOXML server. Run 'ooxml login'.");
		}
		return tokens;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

async function logout(): Promise<void> {
	try {
		await unlink(authFile());
		console.log("Signed out locally.");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		console.log("Already signed out.");
	}
}

function authFile(): string {
	if (process.env.OOXML_AUTH_FILE) return process.env.OOXML_AUTH_FILE;
	if (process.platform === "win32") {
		return join(process.env.LOCALAPPDATA ?? homedir(), "ooxml-dev", "auth.json");
	}
	return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "ooxml-dev", "auth.json");
}

async function openBrowser(url: string): Promise<void> {
	if (process.env.OOXML_NO_BROWSER === "1") {
		console.log(url);
		return;
	}

	const command =
		process.platform === "darwin"
			? ["open", url]
			: process.platform === "win32"
				? ["rundll32.exe", "url.dll,FileProtocolHandler", url]
				: ["xdg-open", url];
	try {
		const processHandle = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
		if ((await processHandle.exited) === 0) return;
	} catch {
		// Print the URL when the platform opener is unavailable.
	}
	console.log(`Open this URL to continue:\n${url}`);
}

function base64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64url");
}

function printHelp(): void {
	console.log(`OOXML CLI

Usage:
  ooxml login
  ooxml logout
  ooxml whoami
  ooxml tools
  ooxml call <tool> ['{"arg":"value"}']`);
}

if (import.meta.main) {
	runCli().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
