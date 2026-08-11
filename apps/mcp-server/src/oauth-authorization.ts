import { createClerkClient } from "@clerk/backend";
import type {
	AuthorizationError,
	AuthRequest,
	ClientInfo,
	OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import type { McpAuthorizationProps } from "./mcp-auth";

const DEFAULT_SIGN_IN_URL = "https://ooxml.dev/sign-in";
const CLERK_AUTHORIZED_PARTIES = [
	"https://ooxml.dev",
	"https://www.ooxml.dev",
	"https://api.ooxml.dev",
];

interface ClerkAuthEnv {
	CLERK_PUBLISHABLE_KEY: string;
	CLERK_SECRET_KEY: string;
}

interface AuthenticatedUser {
	userId: string;
	headers?: Headers;
}

type AuthenticationResult = AuthenticatedUser | Response | null;

interface AuthorizationHandlerOptions {
	oauth: Pick<OAuthHelpers, "parseAuthRequest" | "lookupClient" | "completeAuthorization">;
	authenticateUser: (request: Request) => Promise<AuthenticationResult>;
	signInUrl?: string;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function htmlResponse(body: string, status = 200): Response {
	return new Response(body, {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Content-Security-Policy":
				"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
			"Content-Type": "text/html; charset=utf-8",
			"Referrer-Policy": "origin",
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options": "DENY",
		},
	});
}

function withAuthenticationHeaders(response: Response, headers?: Headers): Response {
	if (!headers || [...headers].length === 0) return response;

	const mergedHeaders = new Headers(response.headers);
	for (const [name, value] of headers) mergedHeaders.append(name, value);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: mergedHeaders,
	});
}

function errorPage(message: string, status = 400): Response {
	return htmlResponse(
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connection failed | ooxml.dev</title></head><body><main><h1>We couldn't connect your MCP client</h1><p>${escapeHtml(message)}</p></main></body></html>`,
		status,
	);
}

function authorizationErrorResponse(error: AuthorizationError): Response {
	if (!error.redirectUri) return errorPage(error.description);

	const redirect = new URL(error.redirectUri);
	redirect.searchParams.set("error", error.code);
	redirect.searchParams.set("error_description", error.description);
	if (error.state) redirect.searchParams.set("state", error.state);
	if (error.issuer) redirect.searchParams.set("iss", error.issuer);
	return Response.redirect(redirect, 302);
}

function isAuthorizationError(error: unknown): error is AuthorizationError {
	if (!(error instanceof Error)) return false;
	const oauthError = error as Partial<AuthorizationError>;
	return typeof oauthError.code === "string" && typeof oauthError.description === "string";
}

function denyAuthorization(request: AuthRequest): Response {
	const redirect = new URL(request.redirectUri);
	redirect.searchParams.set("error", "access_denied");
	redirect.searchParams.set("error_description", "You cancelled the connection.");
	redirect.searchParams.set("state", request.state);
	if (request.issuer) redirect.searchParams.set("iss", request.issuer);
	return Response.redirect(redirect, 302);
}

function signInRedirect(request: Request, signInUrl: string): Response {
	const redirect = new URL(signInUrl);
	redirect.searchParams.set("redirect_url", request.url);
	return Response.redirect(redirect, 302);
}

function isTrustedConsentPost(request: Request): boolean {
	const origin = request.headers.get("Origin");
	if (origin === new URL(request.url).origin) return true;

	// Some browser navigations serialize Origin as null. Sec-Fetch-Site is a
	// browser-controlled header, so only accept that form for a same-origin post.
	return origin === "null" && request.headers.get("Sec-Fetch-Site") === "same-origin";
}

function consentPage(request: Request, client: ClientInfo, oauthRequest: AuthRequest): Response {
	const url = new URL(request.url);
	const clientName = escapeHtml(client.clientName ?? "Your MCP client");
	const action = escapeHtml(`${url.pathname}${url.search}`);
	const scopes = oauthRequest.scope.length
		? `<p class="scope">Requested access: ${escapeHtml(oauthRequest.scope.join(", "))}</p>`
		: "";

	return htmlResponse(`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width,initial-scale=1">
		<title>Connect MCP client | ooxml.dev</title>
		<style>
			:root { color-scheme: light; font-family: Inter, system-ui, -apple-system, sans-serif; color: #1c1917; background: #fafaf9; }
			* { box-sizing: border-box; }
			body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 48px 16px; background: #fafaf9; }
			.card { width: min(100%, 384px); border: 1px solid #e7e5e4; border-radius: 14px; background: #fff; padding: 32px; box-shadow: 0 1px 2px rgba(28, 25, 23, .04), 0 8px 24px rgba(28, 25, 23, .04); }
			.brand { display: flex; align-items: baseline; justify-content: center; gap: 1px; margin: 0 0 24px; color: #1c1917; font-size: 19px; font-weight: 700; letter-spacing: -.02em; }
			.bracket { color: #c2410c; font-family: "JetBrains Mono", ui-monospace, monospace; font-weight: 500; }
			h1 { margin: 0; text-align: center; font-size: 20px; font-weight: 600; line-height: 1.4; letter-spacing: -.01em; }
			.intro { margin: 6px 0 24px; text-align: center; color: #57534e; font-size: 14px; line-height: 20px; }
			.permissions { margin: 0; padding: 16px 16px 16px 36px; border: 1px solid #e7e5e4; border-radius: 8px; background: #fafaf9; color: #57534e; font-size: 14px; line-height: 1.55; }
			.scope { margin: 12px 0 0; text-align: center; color: #78716c; font-size: 12px; }
			.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px; }
			button { min-height: 42px; border: 1px solid #d6d3d1; border-radius: 8px; background: #fff; color: #1c1917; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; transition: background-color .15s, border-color .15s; }
			button:hover { background: #f5f5f4; }
			button:focus-visible { outline: 2px solid #c2410c; outline-offset: 2px; }
			button.primary { border-color: #c2410c; background: #c2410c; color: #fff; }
			button.primary:hover { border-color: #9a3412; background: #9a3412; }
		</style>
	</head>
	<body>
		<main class="card">
			<p class="brand"><span class="bracket">&lt;</span>ooxml.dev<span class="bracket">/&gt;</span></p>
			<h1>Connect ${clientName}?</h1>
			<p class="intro">This client will be able to use the OOXML reference as you.</p>
			<ul class="permissions"><li>Search and read the OOXML spec</li><li>Record which MCP tools your account uses</li></ul>
			${scopes}
			<form class="actions" method="post" action="${action}">
				<button type="submit" name="decision" value="deny">Cancel</button>
				<button class="primary" type="submit" name="decision" value="approve">Connect</button>
			</form>
		</main>
	</body>
</html>`);
}

export async function authenticateClerkUser(
	request: Request,
	env: ClerkAuthEnv,
): Promise<AuthenticationResult> {
	const clerk = createClerkClient({
		publishableKey: env.CLERK_PUBLISHABLE_KEY,
		secretKey: env.CLERK_SECRET_KEY,
		telemetry: { disabled: true },
	});
	const requestState = await clerk.authenticateRequest(request, {
		authorizedParties: CLERK_AUTHORIZED_PARTIES,
		domain: "api.ooxml.dev",
		isSatellite: true,
		// Keep the satellite handshake on the existing Clerk custom domain.
		proxyUrl: "https://clerk.ooxml.dev",
		satelliteAutoSync: true,
		signInUrl: DEFAULT_SIGN_IN_URL,
		signUpUrl: "https://ooxml.dev/sign-up",
	});
	const handshakeLocation = requestState.headers.get("Location");
	if (handshakeLocation) {
		return new Response(null, { status: 307, headers: requestState.headers });
	}
	if (requestState.status === "handshake") {
		throw new Error("Clerk returned a session handshake without a redirect");
	}
	if (!requestState.isAuthenticated) return null;

	const { userId } = requestState.toAuth();
	return userId ? { userId, headers: requestState.headers } : null;
}

export async function handleAuthorizationRequest(
	request: Request,
	options: AuthorizationHandlerOptions,
): Promise<Response> {
	if (request.method !== "GET" && request.method !== "POST") {
		return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
	}

	let oauthRequest: AuthRequest;
	try {
		oauthRequest = await options.oauth.parseAuthRequest(request);
	} catch (error) {
		if (isAuthorizationError(error)) return authorizationErrorResponse(error);
		throw error;
	}

	const client = await options.oauth.lookupClient(oauthRequest.clientId);
	if (!client) return errorPage("This OAuth client isn't registered.");

	const authentication = await options.authenticateUser(request);
	if (authentication instanceof Response) return authentication;
	if (!authentication) return signInRedirect(request, options.signInUrl ?? DEFAULT_SIGN_IN_URL);
	const respond = (response: Response) =>
		withAuthenticationHeaders(response, authentication.headers);

	if (request.method === "GET") return respond(consentPage(request, client, oauthRequest));

	if (!isTrustedConsentPost(request)) {
		return respond(errorPage("The consent request did not come from ooxml.dev.", 403));
	}

	const form = await request.formData();
	if (form.get("decision") !== "approve") return respond(denyAuthorization(oauthRequest));

	const props: McpAuthorizationProps = {
		userId: authentication.userId,
		clientId: oauthRequest.clientId,
		scopes: oauthRequest.scope,
	};
	const { redirectTo } = await options.oauth.completeAuthorization({
		request: oauthRequest,
		userId: authentication.userId,
		metadata: { clientName: client.clientName ?? null },
		scope: oauthRequest.scope,
		props,
	});

	return respond(Response.redirect(redirectTo, 302));
}
