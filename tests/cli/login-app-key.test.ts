import { expect, test } from "bun:test";

test("login refuses to run with an application key instead of claiming a sign-in", () => {
	const result = Bun.spawnSync(["bun", "apps/cli/src/cli.ts", "login"], {
		env: { ...process.env, OOXML_API_KEY: `ooxml_app_${"a".repeat(64)}` },
	});

	expect(result.exitCode).not.toBe(0);
	expect(result.stdout.toString()).not.toContain("Signed in");
	expect(result.stderr.toString()).toContain("OOXML_API_KEY");
});
