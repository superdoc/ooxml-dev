import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
	downloadVerifiedSource,
	readNestedZipEntry,
	sha256,
} from "../../scripts/lib/source-artifact.ts";

async function zip(output: string, input: string): Promise<void> {
	const process = Bun.spawn(["zip", "-j", "-q", output, input], {
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await process.exited) !== 0) throw new Error(`Could not create ${output}`);
}

test("verifies a pinned source before returning its bytes", async () => {
	const bytes = new TextEncoder().encode("source artifact");
	const source = {
		name: "fixture",
		url: "https://example.test/source.zip",
		sha256: sha256(bytes),
	};
	const fetchSource = async () => new Response(bytes);

	expect(await downloadVerifiedSource(source, fetchSource)).toEqual(bytes);
	await expect(
		downloadVerifiedSource({ ...source, sha256: "0".repeat(64) }, fetchSource),
	).rejects.toThrow("fixture hash mismatch");
});

test("reads a file through nested ZIP entries", async () => {
	const directory = await mkdtemp(join(tmpdir(), "ooxml-source-test-"));
	try {
		const xmlPath = join(directory, "shapes.xml");
		const innerZip = join(directory, "inner.zip");
		const outerZip = join(directory, "outer.zip");
		await Bun.write(xmlPath, "<shapes><rect/></shapes>");
		await zip(innerZip, xmlPath);
		await zip(outerZip, innerZip);

		const archive = new Uint8Array(await Bun.file(outerZip).arrayBuffer());
		const xml = await readNestedZipEntry(archive, ["inner.zip", "shapes.xml"]);

		expect(new TextDecoder().decode(xml)).toBe("<shapes><rect/></shapes>");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
