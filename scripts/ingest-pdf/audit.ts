/**
 * Audit an extracted corpus before embedding or upload.
 *
 * Usage:
 *   bun scripts/ingest-pdf/audit.ts <extracted-dir>
 */

import { type Chunk, chunkSections } from "./chunk";

const TOC_TITLE_PATTERN = /\.{2,}|\s\d{1,4}$/;

export function auditCorpus(chunks: Chunk[], maxPrintedPage: number): void {
	if (chunks.length === 0) throw new Error("Corpus contains no chunks");

	for (const chunk of chunks) {
		if (chunk.pageNumber < 1 || chunk.pageNumber > maxPrintedPage) {
			throw new Error(`${chunk.sectionId} has invalid printed page ${chunk.pageNumber}`);
		}
		if (TOC_TITLE_PATTERN.test(chunk.sectionTitle)) {
			throw new Error(`${chunk.sectionId} has a contents-shaped title: ${chunk.sectionTitle}`);
		}
		if (chunk.content.includes("<!--page:") || chunk.embeddingText.includes("<!--page:")) {
			throw new Error(`${chunk.sectionId} contains an internal page marker`);
		}
	}
}

export async function auditExtractedCorpus(extractedDir: string): Promise<void> {
	const sections = (await Bun.file(`${extractedDir}/sections.json`).json()) as Array<{
		sectionId: string;
	}>;
	const ids = sections.map((section) => section.sectionId);
	if (new Set(ids).size !== ids.length) {
		throw new Error("Duplicate section IDs found; the corpus may include contents entries");
	}

	const metadata = (await Bun.file(`${extractedDir}/metadata.json`).json()) as {
		totalPages: number;
		pageOffset: number;
		printedPages?: number;
	};
	const maxPrintedPage = metadata.printedPages ?? metadata.totalPages - metadata.pageOffset;
	const chunks = await chunkSections(extractedDir);
	auditCorpus(chunks, maxPrintedPage);

	console.log(`Corpus audit passed: ${sections.length} sections, ${chunks.length} chunks`);
}

if (import.meta.main) {
	const [extractedDir] = process.argv.slice(2);
	if (!extractedDir) {
		console.error("Usage: bun scripts/ingest-pdf/audit.ts <extracted-dir>");
		process.exit(1);
	}

	auditExtractedCorpus(extractedDir).catch((error) => {
		console.error("Corpus audit failed:", error);
		process.exit(1);
	});
}
