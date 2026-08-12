import { expect, test } from "bun:test";
import { isSafeAuthorizationUrl } from "../../apps/cli/src/browser-auth";

test("only opens secure or loopback authorization URLs", () => {
	expect(isSafeAuthorizationUrl(new URL("https://api.ooxml.dev/authorize"))).toBe(true);
	expect(isSafeAuthorizationUrl(new URL("http://127.0.0.1:8787/authorize"))).toBe(true);
	expect(isSafeAuthorizationUrl(new URL("http://localhost:8787/authorize"))).toBe(true);
	expect(isSafeAuthorizationUrl(new URL("http://api.ooxml.dev/authorize"))).toBe(false);
	expect(isSafeAuthorizationUrl(new URL("file:///tmp/authorize"))).toBe(false);
});
