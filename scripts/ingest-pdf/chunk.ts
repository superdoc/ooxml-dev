/**
 * Text Chunking Script
 *
 * Takes extracted PDF content and creates chunks for embedding.
 * Respects section boundaries and handles XML examples specially.
 *
 * Page numbers: extract.py leaves `<!--page:N-->` markers in each section's
 * body, where N is the physical page the following text came from. We track
 * those markers while walking the content so a chunk records the page it
 * actually falls on, not the page its section started on. Markers are stripped
 * from the stored content and from the embedding text.
 *
 * `pageNumber` is the *printed* page (physical minus the part's front-matter
 * offset, read from the extraction metadata) - the number printed on the page
 * and stored in `spec_content.page_number`.
 *
 * Usage:
 *   bun scripts/ingest-pdf/chunk.ts <extracted-dir> <output-file>
 *
 * Example:
 *   bun scripts/ingest-pdf/chunk.ts ./extracted/part1 ./chunks/part1-chunks.json
 */

interface ExtractedSection {
	sectionId: string;
	title: string;
	pageStart: number;
	pageEnd: number;
	content: string;
	depth: number;
	parentId: string | null;
}

interface Chunk {
	sectionId: string;
	sectionTitle: string;
	content: string;
	embeddingText: string;
	contentType: "text";
	pageNumber: number;
	chunkIndex: number;
}

// Chunking configuration
const CHUNK_SIZE = 6000; // ~2000-3000 tokens
const CHUNK_OVERLAP = 200;

// Page markers written by extract.py (physical page number).
const PAGE_MARKER_PATTERN = /<!--page:(\d+)-->/g;

// Markdown code fence pattern (pymupdf4llm outputs code in fences)
const CODE_FENCE_PATTERN = /```[\s\S]*?```/g;

// Raw XML code block pattern (fallback for non-fenced XML)
const XML_PATTERN = /<[^>]+>[\s\S]*?<\/[^>]+>/g;

// Table pattern (markdown tables with | separators)
const TABLE_PATTERN = /\|[^\n]+\|(?:\n\|[^\n]+\|)+/g;

/**
 * Strip code blocks, XML, and tables from content for embedding generation.
 * Returns text-only version suitable for semantic search embeddings.
 */
function stripForEmbedding(content: string): string {
	let text = content;

	// Strip markdown code fences
	text = text.replace(CODE_FENCE_PATTERN, " ");

	// Strip raw XML blocks
	text = text.replace(XML_PATTERN, " ");

	// Strip markdown tables
	text = text.replace(TABLE_PATTERN, " ");

	// Collapse whitespace
	return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Pull page markers out of a paragraph.
 *
 * Returns the paragraph without markers, plus the last physical page seen in
 * it (null when the paragraph carried no marker).
 */
function takePageMarkers(paragraph: string): { text: string; physicalPage: number | null } {
	let physicalPage: number | null = null;

	const text = paragraph.replace(PAGE_MARKER_PATTERN, (_match, page: string) => {
		physicalPage = Number.parseInt(page, 10);
		return "";
	});

	return { text: text.trim(), physicalPage };
}

function splitIntoChunks(
	text: string,
	sectionId: string,
	sectionTitle: string,
	pageStart: number,
	pageOffset: number,
): Chunk[] {
	const chunks: Chunk[] = [];

	if (text.trim().length === 0) {
		return chunks;
	}

	// Physical page -> printed page. Sections start on a printed page already,
	// so fall back to that until the first marker is seen.
	const toPrinted = (physical: number) => Math.max(1, physical - pageOffset);

	const paragraphs = text.split(/\n\n+/);
	let currentChunk = "";
	let currentPage = pageStart;
	let chunkPage = pageStart;

	const pushChunk = () => {
		const content = currentChunk.trim();
		if (!content) return;

		chunks.push({
			sectionId,
			sectionTitle,
			content,
			embeddingText: stripForEmbedding(content),
			contentType: "text",
			pageNumber: chunkPage,
			chunkIndex: chunks.length,
		});
	};

	for (const para of paragraphs) {
		const { text: trimmedPara, physicalPage } = takePageMarkers(para);

		if (physicalPage !== null) {
			currentPage = toPrinted(physicalPage);
			// A marker that arrives while the chunk is still empty belongs to
			// the chunk about to be started.
			if (!currentChunk.trim()) {
				chunkPage = currentPage;
			}
		}

		if (!trimmedPara) continue;

		// Check if adding this paragraph exceeds chunk size
		if (currentChunk.length + trimmedPara.length > CHUNK_SIZE) {
			pushChunk();

			// Start new chunk with overlap, on whichever page we have reached
			const overlap = currentChunk.slice(-CHUNK_OVERLAP);
			currentChunk = `${overlap}\n\n${trimmedPara}`;
			chunkPage = currentPage;
		} else {
			if (!currentChunk) {
				chunkPage = currentPage;
			}
			currentChunk += (currentChunk ? "\n\n" : "") + trimmedPara;
		}
	}

	pushChunk();

	return chunks;
}

async function readPageOffset(extractedDir: string): Promise<number> {
	try {
		const metadata = await Bun.file(`${extractedDir}/metadata.json`).json();
		const offset = metadata?.pageOffset;
		if (typeof offset === "number") return offset;
	} catch {
		// Extraction predating page offsets - fall through.
	}

	console.warn(
		"  No pageOffset in metadata.json; treating extracted pages as printed pages.\n" +
			"  Re-run extract.py so page numbers line up with the PDF.",
	);
	return 0;
}

async function chunkSections(extractedDir: string): Promise<Chunk[]> {
	const sectionsJson = await Bun.file(`${extractedDir}/sections.json`).text();
	const sections: ExtractedSection[] = JSON.parse(sectionsJson);
	const pageOffset = await readPageOffset(extractedDir);

	console.log(`Processing ${sections.length} sections (page offset ${pageOffset})...`);

	const allChunks: Chunk[] = [];

	for (const section of sections) {
		const chunks = splitIntoChunks(
			section.content,
			section.sectionId,
			section.title,
			section.pageStart,
			pageOffset,
		);
		allChunks.push(...chunks);
	}

	return allChunks;
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 2) {
		console.log("Usage: bun scripts/ingest-pdf/chunk.ts <extracted-dir> <output-file>");
		console.log("");
		console.log("Example:");
		console.log("  bun scripts/ingest-pdf/chunk.ts ./extracted/part1 ./chunks/part1-chunks.json");
		process.exit(1);
	}

	const [extractedDir, outputFile] = args;

	try {
		const chunks = await chunkSections(extractedDir);

		// Save chunks
		await Bun.write(outputFile, JSON.stringify(chunks, null, 2));
		console.log(`\nSaved ${chunks.length} chunks to ${outputFile}`);

		// Print stats
		const avgContent = Math.round(
			chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length,
		);
		const avgEmbedding = Math.round(
			chunks.reduce((sum, c) => sum + c.embeddingText.length, 0) / chunks.length,
		);
		const multiPageSections = new Set(
			chunks.filter((c) => c.chunkIndex > 0).map((c) => c.sectionId),
		).size;

		console.log("\nChunk statistics:");
		console.log(`  Total chunks: ${chunks.length}`);
		console.log(`  Average content size: ${avgContent} chars`);
		console.log(`  Average embedding text size: ${avgEmbedding} chars`);
		console.log(`  Sections spanning multiple chunks: ${multiPageSections}`);
	} catch (error) {
		console.error("Chunking failed:", error);
		process.exit(1);
	}
}

main();
