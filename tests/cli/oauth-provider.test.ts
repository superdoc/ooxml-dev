import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CredentialStore } from "../../apps/cli/src/credentials";
import { CliOAuthProvider } from "../../apps/cli/src/oauth-provider";

test("validates the OAuth state created for the current sign-in", async () => {
	const directory = await mkdtemp(join(tmpdir(), "ooxml-cli-oauth-"));
	const store = await new CredentialStore(join(directory, "credentials.json")).open();
	const provider = new CliOAuthProvider("http://127.0.0.1:53682/callback", store);
	await provider.load();

	const state = provider.state();
	expect(provider.validatesState(state)).toBe(true);
	expect(provider.validatesState("different")).toBe(false);
	expect(provider.validatesState(null)).toBe(false);
	await store.close();
});

test("removes the PKCE verifier after saving tokens", async () => {
	const directory = await mkdtemp(join(tmpdir(), "ooxml-cli-oauth-"));
	const store = await new CredentialStore(join(directory, "credentials.json")).open();
	const provider = new CliOAuthProvider("http://127.0.0.1:53682/callback", store);
	await provider.load();

	await provider.saveCodeVerifier("secret-verifier");
	await provider.saveTokens({ access_token: "access-token", token_type: "bearer" });

	expect(await store.read()).toEqual({
		tokens: { access_token: "access-token", token_type: "bearer" },
	});
	await store.close();
});
