import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import open from "open";
import type { CliOAuthProvider } from "./oauth-provider.js";

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export function isSafeAuthorizationUrl(url: URL): boolean {
	return (
		url.protocol === "https:" ||
		(url.protocol === "http:" && ["127.0.0.1", "::1", "localhost"].includes(url.hostname))
	);
}

export function signInMessage(url: URL): string {
	return `Opening your browser to sign in…\nIf it does not open, visit:\n${url}`;
}

function callbackPage(success: boolean): string {
	const title = success ? "Signed in to ooxml.dev" : "Sign-in failed";
	const detail = success
		? "You can close this window and return to the terminal."
		: "Return to the terminal and try again.";
	const closeWindow = success ? "setTimeout(()=>window.close(),2000);" : "";
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#f8f7f4;color:#292524;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}main{max-width:420px;padding:40px;text-align:center}h1{font-size:26px}p{color:#78716c}</style></head><body><main><h1>${title}</h1><p>${detail}</p></main><script>history.replaceState(null,"","/complete");${closeWindow}</script></body></html>`;
}

interface OAuthCallback {
	port: number;
	result: Promise<URLSearchParams>;
}

export async function startOAuthCallback(
	port: number,
	validatesState: (state: string | null) => boolean,
	timeoutMs = CALLBACK_TIMEOUT_MS,
): Promise<OAuthCallback> {
	let settled = false;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let resolveResult!: (params: URLSearchParams) => void;
	let rejectResult!: (error: Error) => void;
	const result = new Promise<URLSearchParams>((resolve, reject) => {
		resolveResult = resolve;
		rejectResult = reject;
	});
	result.catch(() => {});

	const server = createServer((request, response) => {
		if (settled) {
			response.writeHead(409).end("Sign-in callback already handled");
			return;
		}
		const address = server.address() as AddressInfo;
		const expectedHost = `127.0.0.1:${address.port}`;
		if (request.headers.host !== expectedHost) {
			response.writeHead(400).end("Invalid sign-in callback");
			return;
		}

		const url = new URL(request.url ?? "/", `http://${expectedHost}`);
		if (url.pathname !== "/callback") {
			response.writeHead(404).end();
			return;
		}
		if (!validatesState(url.searchParams.get("state"))) {
			response.writeHead(400, { "Cache-Control": "no-store" }).end("Invalid sign-in state");
			return;
		}
		if (!url.searchParams.has("code") && !url.searchParams.has("error")) {
			response.writeHead(400, { "Cache-Control": "no-store" }).end("Invalid sign-in callback");
			return;
		}

		settled = true;
		if (timeout) clearTimeout(timeout);
		const success = Boolean(url.searchParams.get("code")) && !url.searchParams.get("error");
		response.writeHead(success ? 200 : 400, {
			"Cache-Control": "no-store",
			"Content-Type": "text/html; charset=utf-8",
			"Referrer-Policy": "no-referrer",
		});
		response.end(callbackPage(success));
		server.close();
		resolveResult(url.searchParams);
	});

	try {
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(port, "127.0.0.1", () => {
				server.removeAllListeners("error");
				resolve();
			});
		});
	} catch (error) {
		settled = true;
		const callbackError = new Error(`Could not start the local sign-in callback on port ${port}`, {
			cause: error,
		});
		rejectResult(callbackError);
		throw callbackError;
	}

	server.once("error", (error) => {
		if (settled) return;
		settled = true;
		if (timeout) clearTimeout(timeout);
		rejectResult(new Error("The local sign-in callback stopped", { cause: error }));
	});
	timeout = setTimeout(() => {
		if (settled) return;
		settled = true;
		server.close();
		rejectResult(new Error("Timed out waiting for browser sign-in"));
	}, timeoutMs);

	return { port: (server.address() as AddressInfo).port, result };
}

export async function authorizeInBrowser(
	provider: CliOAuthProvider,
	port: number,
	finishAuth: (params: URLSearchParams) => Promise<void>,
): Promise<void> {
	const authorizationUrl = provider.pendingAuthorizationUrl;
	if (!authorizationUrl) throw new Error("The OOXML service did not provide a sign-in URL");
	if (!isSafeAuthorizationUrl(authorizationUrl)) {
		throw new Error("The OOXML service returned an unsafe sign-in URL");
	}

	const callback = await startOAuthCallback(port, (state) => provider.validatesState(state));
	console.error(signInMessage(authorizationUrl));
	try {
		await open(authorizationUrl.toString());
	} catch {}

	const params = await callback.result;
	if (params.get("error")) throw new Error("Sign-in was canceled or denied");
	if (!provider.validatesState(params.get("state"))) {
		throw new Error("Sign-in could not be verified. Try again.");
	}
	await finishAuth(params);
}
