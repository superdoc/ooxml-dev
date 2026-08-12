/**
 * Full Ingestion Pipeline
 *
 * Runs the complete ingestion process: extract -> chunk -> embed -> upload
 *
 * Usage:
 *   bun scripts/ingest-pdf/pipeline.ts <part-number> <pdf-path>
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 *   VOYAGE_API_KEY
 *
 * Example:
 *   bun scripts/ingest-pdf/pipeline.ts 1 ./pdfs/ECMA-376-Part1.pdf
 */

import { $ } from "bun";

async function main() {
	const args = process.argv.slice(2);

	if (args.length < 2) {
		console.log("Usage: bun scripts/ingest-pdf/pipeline.ts <part-number> <pdf-path>");
		console.log("");
		console.log("Environment variables:");
		console.log("  DATABASE_URL - PostgreSQL connection string");
		console.log("  VOYAGE_API_KEY");
		console.log("");
		console.log("Example:");
		console.log("  bun scripts/ingest-pdf/pipeline.ts 1 ./pdfs/ECMA-376-Part1.pdf");
		process.exit(1);
	}

	const [partNumberStr, pdfPath] = args;
	const partNumber = parseInt(partNumberStr, 10);

	if (Number.isNaN(partNumber) || partNumber < 1 || partNumber > 4) {
		console.error("Part number must be 1, 2, 3, or 4");
		process.exit(1);
	}

	// Check environment
	if (!process.env.DATABASE_URL) {
		console.error("Missing DATABASE_URL environment variable");
		process.exit(1);
	}

	if (!process.env.VOYAGE_API_KEY) {
		console.error("Missing VOYAGE_API_KEY environment variable");
		process.exit(1);
	}

	// Create directories
	const extractedDir = `./data/extracted/part${partNumber}`;
	const chunksFile = `./data/chunks/part${partNumber}-chunks.json`;
	const embeddedFile = `./data/embedded/part${partNumber}-embedded.json`;

	await $`mkdir -p ./data/extracted ./data/chunks ./data/embedded`;

	console.log("=".repeat(60));
	console.log(`ECMA-376 Part ${partNumber} Ingestion Pipeline`);
	console.log("=".repeat(60));
	console.log(`PDF: ${pdfPath}`);
	console.log("Embedding provider: Voyage");
	console.log("");

	// Step 1: Extract (using Python + pymupdf4llm for better markdown output)
	console.log("\n[1/5] Extracting PDF...");
	console.log("-".repeat(40));

	// Try different Python paths (pymupdf4llm may be installed in a specific version)
	const pythonPaths = [
		process.env.PYTHON_PATH,
		"/opt/homebrew/bin/python3.10",
		"/opt/homebrew/bin/python3",
		"python3",
		"python",
	].filter(Boolean);

	let extractSuccess = false;
	for (const pythonPath of pythonPaths) {
		try {
			await $`${pythonPath} -c "import pymupdf4llm" 2>/dev/null`;
			console.log(`Using Python: ${pythonPath}`);
			await $`${pythonPath} scripts/ingest-pdf/extract.py ${pdfPath} ${extractedDir}`;
			extractSuccess = true;
			break;
		} catch {
			// Try next Python path
		}
	}

	if (!extractSuccess) {
		console.error("Failed to find Python with pymupdf4llm installed.");
		console.error("Install with: pip install -r scripts/requirements.txt");
		console.error("Or set PYTHON_PATH environment variable.");
		process.exit(1);
	}

	// Step 2: Chunk
	console.log("\n[2/5] Chunking content...");
	console.log("-".repeat(40));
	await $`bun scripts/ingest-pdf/chunk.ts ${extractedDir} ${chunksFile}`;

	// Step 3: Audit generated content before spending embedding credits.
	console.log("\n[3/5] Auditing corpus...");
	console.log("-".repeat(40));
	await $`bun scripts/ingest-pdf/audit.ts ${extractedDir}`;

	// Step 4: Embed
	console.log("\n[4/5] Generating embeddings...");
	console.log("-".repeat(40));
	await $`bun scripts/ingest-pdf/embed.ts ${chunksFile} ${embeddedFile}`;

	// Step 5: Upload
	console.log("\n[5/5] Uploading to database...");
	console.log("-".repeat(40));
	await $`bun scripts/ingest-pdf/upload.ts ${partNumber} ${embeddedFile}`;

	console.log(`\n${"=".repeat(60)}`);
	console.log("Pipeline complete!");
	console.log("=".repeat(60));
}

main().catch((error) => {
	console.error("Pipeline failed:", error);
	process.exit(1);
});
