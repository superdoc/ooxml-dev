import type { McpAuthorizationProps } from "./mcp-auth";

// A distinct prefix keeps failed app credentials out of the user OAuth flow.
const PREFIX = "ooxml_app_";

function bearer(request: Request): string {
	return request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

export function isAppKeyRequest(request: Request): boolean {
	return bearer(request).startsWith(PREFIX);
}

export async function authenticateAppKey(
	request: Request,
	expectedHash: string | undefined,
): Promise<McpAuthorizationProps | null> {
	const token = bearer(request);
	if (
		!/^Bearer\s+/i.test(request.headers.get("Authorization") ?? "") ||
		!/^ooxml_app_[a-f0-9]{64}$/.test(token) ||
		!expectedHash ||
		!/^[a-f0-9]{64}$/.test(expectedHash)
	)
		return null;
	const digest = new Uint8Array(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
	);
	let difference = 0;
	for (let i = 0; i < digest.length; i++) {
		difference |= digest[i]! ^ parseInt(expectedHash.slice(i * 2, i * 2 + 2), 16);
	}
	return difference === 0
		? { userId: null, appId: "pip", clientId: "pip", scopes: ["ooxml:read"] }
		: null;
}
