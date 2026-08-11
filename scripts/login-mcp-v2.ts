import { MCP_V2_PROTOCOL_VERSION, MCP_V2_TOOL_NAME } from "../apps/mcp-server/src/mcp-v2";

const CLIENT_ID = process.env.CLERK_OAUTH_CLIENT_ID ?? "ywoNOfxsoQ8Dw1FW";
const AUTHORIZATION_SERVER =
	process.env.CLERK_OAUTH_ISSUER ?? "https://glad-beetle-33.clerk.accounts.dev";
const MCP_URL = process.env.OOXML_MCP_URL ?? "https://api.ooxml.dev/mcp-v2";
const CALLBACK_URL = "http://127.0.0.1:45879/callback";

const metadataResponse = await fetch(
	`${AUTHORIZATION_SERVER}/.well-known/oauth-authorization-server`,
);
const metadata = (await metadataResponse.json()) as {
	issuer?: string;
	authorization_endpoint?: string;
	token_endpoint?: string;
	code_challenge_methods_supported?: string[];
};
if (
	!metadataResponse.ok ||
	metadata.issuer !== AUTHORIZATION_SERVER ||
	!metadata.authorization_endpoint ||
	!metadata.token_endpoint
) {
	throw new Error("Clerk OAuth metadata is missing or has the wrong issuer");
}
if (!metadata.code_challenge_methods_supported?.includes("S256")) {
	throw new Error("Clerk does not advertise the required S256 PKCE method");
}

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
	scope: "profile",
	state,
	code_challenge: challenge,
	code_challenge_method: "S256",
	resource: MCP_URL,
}).toString();

let completeCallback: (value: { code: string } | { error: Error }) => void = () => {};
const callback = new Promise<{ code: string } | { error: Error }>((resolve) => {
	completeCallback = resolve;
});

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 45879,
	fetch(request) {
		const url = new URL(request.url);
		if (url.pathname !== "/callback") return new Response("Not found", { status: 404 });

		const oauthError = url.searchParams.get("error");
		const returnedState = url.searchParams.get("state");
		const returnedIssuer = url.searchParams.get("iss");
		const code = url.searchParams.get("code");
		if (oauthError) {
			completeCallback({ error: new Error(`Clerk authorization failed: ${oauthError}`) });
			return new Response("Authorization failed. You can close this tab.", { status: 400 });
		}
		if (
			returnedState !== state ||
			(returnedIssuer !== null && returnedIssuer !== AUTHORIZATION_SERVER) ||
			!code
		) {
			return new Response("Invalid OAuth callback.", { status: 400 });
		}

		completeCallback({ code });
		return new Response("OOXML CLI is connected. You can close this tab.", {
			headers: { "Content-Type": "text/plain; charset=utf-8" },
		});
	},
});

console.log("Opening Clerk sign-in in your browser...");
if (process.env.OOXML_NO_BROWSER === "1") {
	console.log(authorizationUrl.toString());
} else {
	Bun.spawn(["open", authorizationUrl.toString()], { stdout: "ignore", stderr: "ignore" });
}

const callbackResult = await Promise.race([
	callback,
	new Promise<{ error: Error }>((resolve) =>
		setTimeout(() => resolve({ error: new Error("Clerk authorization timed out") }), 120_000),
	),
]);
server.stop(true);

if ("error" in callbackResult) throw callbackResult.error;

const tokenResponse = await fetch(metadata.token_endpoint, {
	method: "POST",
	headers: { "Content-Type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams({
		grant_type: "authorization_code",
		client_id: CLIENT_ID,
		code: callbackResult.code,
		redirect_uri: CALLBACK_URL,
		code_verifier: verifier,
		resource: MCP_URL,
	}),
});
const tokenBody = (await tokenResponse.json()) as {
	access_token?: string;
	error?: string;
	error_description?: string;
};
if (!tokenResponse.ok || !tokenBody.access_token) {
	throw new Error(tokenBody.error_description ?? tokenBody.error ?? "Clerk token exchange failed");
}

const mcpResponse = await fetch(MCP_URL, {
	method: "POST",
	headers: {
		Authorization: `Bearer ${tokenBody.access_token}`,
		"Content-Type": "application/json",
		"MCP-Protocol-Version": MCP_V2_PROTOCOL_VERSION,
		"Mcp-Method": "tools/call",
		"Mcp-Name": MCP_V2_TOOL_NAME,
	},
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
					name: "ooxml-cli-oauth-probe",
					version: "0.1.0",
				},
				"io.modelcontextprotocol/clientCapabilities": {},
			},
		},
	}),
});

const mcpBody = (await mcpResponse.json()) as {
	result?: { content?: Array<{ text?: string }>; resultType?: string };
	error?: { message?: string };
};
if (!mcpResponse.ok) throw new Error(mcpBody.error?.message ?? "Authenticated MCP call failed");

console.log(mcpBody.result?.content?.[0]?.text ?? "Authenticated MCP call completed.");

function base64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64url");
}
