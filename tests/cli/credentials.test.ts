import { expect, test } from "bun:test";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CredentialStore } from "../../apps/cli/src/credentials";

test("round-trips credentials and removes them on logout", async () => {
	const directory = await mkdtemp(join(tmpdir(), "ooxml-cli-credentials-"));
	const path = join(directory, "credentials.json");
	const store = await new CredentialStore(path).open();

	await store.write({ tokens: { access_token: "secret", token_type: "bearer" } });
	expect(await store.read()).toEqual({
		tokens: { access_token: "secret", token_type: "bearer" },
	});
	expect(await readFile(path, "utf8")).not.toContain("undefined");
	if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);

	await store.clear();
	expect(await store.read()).toEqual({});
	await store.close();
});

test("allows only one credential session at a time", async () => {
	const directory = await mkdtemp(join(tmpdir(), "ooxml-cli-credentials-"));
	const path = join(directory, "credentials.json");
	const first = await new CredentialStore(path).open();
	let secondOpened = false;
	const secondPromise = new CredentialStore(path).open().then((session) => {
		secondOpened = true;
		return session;
	});

	await Bun.sleep(100);
	expect(secondOpened).toBe(false);
	await first.close();
	const second = await secondPromise;
	expect(secondOpened).toBe(true);
	await second.close();
});
