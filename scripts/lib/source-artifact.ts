import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export interface SourceEntry {
	name: string;
	url: string;
	sha256: string;
}

interface SourceManifest {
	sources: SourceEntry[];
}

export function sha256(data: ArrayBuffer | Uint8Array | string): string {
	return createHash("sha256").update(data).digest("hex");
}

export async function loadSourceEntry(
	name: string,
	manifestPath = "data/sources.json",
): Promise<SourceEntry> {
	const manifest = (await Bun.file(manifestPath).json()) as SourceManifest;
	const source = manifest.sources.find((entry) => entry.name === name);
	if (!source) throw new Error(`Missing ${name} in ${manifestPath}`);
	if (!source.url || !source.sha256) throw new Error(`Source ${name} must include url and sha256`);
	return source;
}

export async function downloadVerifiedSource(
	source: SourceEntry,
	fetchSource: typeof fetch = fetch,
): Promise<Uint8Array> {
	const response = await fetchSource(source.url);
	if (!response.ok) throw new Error(`Could not download ${source.name}: ${response.status}`);

	const bytes = new Uint8Array(await response.arrayBuffer());
	const actualHash = sha256(bytes);
	if (actualHash !== source.sha256) {
		throw new Error(`${source.name} hash mismatch: expected ${source.sha256}, got ${actualHash}`);
	}
	return bytes;
}

async function extractZipEntry(
	zipPath: string,
	entry: string,
	destination: string,
): Promise<string> {
	const process = Bun.spawn(["unzip", "-j", "-o", "-q", zipPath, entry, "-d", destination], {
		stdout: "inherit",
		stderr: "pipe",
	});
	const [error, code] = await Promise.all([new Response(process.stderr).text(), process.exited]);
	if (code !== 0) throw new Error(`Could not extract ${entry}: ${error.trim()}`);
	return join(destination, basename(entry));
}

/**
 * Read one file through a chain of nested ZIP entries.
 *
 * Each entry except the last must itself be a ZIP. For example:
 * outer.zip -> part1.zip -> geometries.zip -> presetShapeDefinitions.xml
 */
export async function readNestedZipEntry(
	archive: Uint8Array,
	entries: readonly string[],
): Promise<Uint8Array> {
	if (entries.length === 0) throw new Error("At least one ZIP entry is required");

	const tempDirectory = await mkdtemp(join(tmpdir(), "ooxml-source-"));
	try {
		let archivePath = join(tempDirectory, "source.zip");
		await Bun.write(archivePath, archive);

		for (const [index, entry] of entries.entries()) {
			const stageDirectory = join(tempDirectory, String(index));
			await mkdir(stageDirectory);
			archivePath = await extractZipEntry(archivePath, entry, stageDirectory);
		}
		return new Uint8Array(await Bun.file(archivePath).arrayBuffer());
	} finally {
		await rm(tempDirectory, { recursive: true, force: true });
	}
}

export async function readPinnedNestedZipEntry(
	sourceName: string,
	entries: readonly string[],
): Promise<Uint8Array> {
	const source = await loadSourceEntry(sourceName);
	return readNestedZipEntry(await downloadVerifiedSource(source), entries);
}
