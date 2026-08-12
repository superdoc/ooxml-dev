import { createServer } from "node:http";
import open from "open";
import type { CliOAuthProvider } from "./oauth-provider.js";

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export function isSafeAuthorizationUrl(url: URL): boolean {
	return (
		url.protocol === "https:" ||
		(url.protocol === "http:" && ["127.0.0.1", "::1", "localhost"].includes(url.hostname))
	);
}

function callbackPage(success: boolean): string {
	const title = success ? "Signed in to ooxml.dev" : "Sign-in failed";
	const detail = success
		? "You can close this window and return to the terminal."
		: "Return to the terminal and try again.";
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#f8f7f4;color:#292524;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}main{max-width:420px;padding:40px;text-align:center}h1{font-size:26px}p{color:#78716c}</style></head><body><main><h1>${title}</h1><p>${detail}</p></main>${success ? "<script>setTimeout(()=>window.close(),2000)</script>" : ""}</body></html>`;
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

	const callback = waitForCallback(port);
	callback.catch(() => {});
	console.error("Opening your browser to sign in…");
	try {
		await open(authorizationUrl.toString());
	} catch {
		console.error(`Open this URL in your browser:\n${authorizationUrl}`);
	}

	const params = await callback;
	if (params.get("error")) throw new Error("Sign-in was canceled or denied");
	if (!provider.validatesState(params.get("state"))) {
		throw new Error("Sign-in could not be verified. Try again.");
	}
	await finishAuth(params);
}

function waitForCallback(port: number): Promise<URLSearchParams> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const server = createServer((request, response) => {
			const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
			if (url.pathname !== "/callback") {
				response.writeHead(404).end();
				return;
			}

			const success = Boolean(url.searchParams.get("code")) && !url.searchParams.get("error");
			response.writeHead(success ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
			response.end(callbackPage(success));
			settled = true;
			clearTimeout(timeout);
			server.close();
			resolve(url.searchParams);
		});

		server.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(
				new Error(`Could not start the local sign-in callback on port ${port}`, { cause: error }),
			);
		});

		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			server.close();
			reject(new Error("Timed out waiting for browser sign-in"));
		}, CALLBACK_TIMEOUT_MS);

		server.listen(port, "127.0.0.1");
	});
}
