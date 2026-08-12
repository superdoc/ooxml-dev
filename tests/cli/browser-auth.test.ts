import { expect, test } from "bun:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isSafeAuthorizationUrl, startOAuthCallback } from "../../apps/cli/src/browser-auth";

test("only opens secure or loopback authorization URLs", () => {
	expect(isSafeAuthorizationUrl(new URL("https://api.ooxml.dev/authorize"))).toBe(true);
	expect(isSafeAuthorizationUrl(new URL("http://127.0.0.1:8787/authorize"))).toBe(true);
	expect(isSafeAuthorizationUrl(new URL("http://localhost:8787/authorize"))).toBe(true);
	expect(isSafeAuthorizationUrl(new URL("http://api.ooxml.dev/authorize"))).toBe(false);
	expect(isSafeAuthorizationUrl(new URL("file:///tmp/authorize"))).toBe(false);
});

test("fails before sign-in when the callback port is occupied", async () => {
	const occupied = createServer();
	await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
	const port = (occupied.address() as AddressInfo).port;
	await expect(startOAuthCallback(port, () => true, 1_000)).rejects.toThrow(
		`Could not start the local sign-in callback on port ${port}`,
	);
	await new Promise<void>((resolve, reject) =>
		occupied.close((error) => (error ? reject(error) : resolve())),
	);
});

test("ignores callbacks with the wrong state and removes secrets from browser history", async () => {
	const callback = await startOAuthCallback(0, (state) => state === "expected", 1_000);
	const baseUrl = `http://127.0.0.1:${callback.port}/callback`;
	const invalid = await fetch(`${baseUrl}?code=forged&state=wrong`);
	expect(invalid.status).toBe(400);

	const valid = await fetch(`${baseUrl}?code=secret-code&state=expected`);
	expect(valid.status).toBe(200);
	expect(valid.headers.get("cache-control")).toBe("no-store");
	expect(valid.headers.get("referrer-policy")).toBe("no-referrer");
	expect(await valid.text()).toContain('history.replaceState(null,"","/complete")');
	expect(Object.fromEntries(await callback.result)).toEqual({
		code: "secret-code",
		state: "expected",
	});
});
