/**
 * Database Upload Script
 *
 * Uploads embedded chunks to the database. By default this REPLACES the part:
 * existing rows for that part number are deleted in the same transaction as the
 * insert, so re-ingesting never leaves duplicate rows behind for search to hit.
 *
 * Usage:
 *   bun scripts/ingest-pdf/upload.ts <part-number> <embedded-file> [--append]
 *
 * Options:
 *   --append - keep existing rows for the part (adds to them instead of replacing)
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 *
 * Example:
 *   bun scripts/ingest-pdf/upload.ts 1 ./embedded/part1-embedded.json
 */

import { createDbClient } from "../../packages/shared/src/db/index.ts";
import type { SpecContent } from "../../packages/shared/src/types/index.ts";

interface EmbeddedChunk {
	sectionId: string;
	sectionTitle: string;
	content: string;
	contentType: string;
	pageNumber: number;
	chunkIndex: number;
	embedding: number[];
}

async function main() {
	const argv = process.argv.slice(2);
	const append = argv.includes("--append");
	const args = argv.filter((arg) => !arg.startsWith("--"));

	if (args.length < 2) {
		console.log("Usage: bun scripts/ingest-pdf/upload.ts <part-number> <embedded-file> [--append]");
		console.log("");
		console.log("Options:");
		console.log("  --append - keep existing rows for the part instead of replacing them");
		console.log("");
		console.log("Environment variables:");
		console.log("  DATABASE_URL - PostgreSQL connection string");
		console.log("");
		console.log("Example:");
		console.log("  bun scripts/ingest-pdf/upload.ts 1 ./embedded/part1-embedded.json");
		process.exit(1);
	}

	const [partNumberStr, embeddedFile] = args;
	const partNumber = parseInt(partNumberStr, 10);

	if (Number.isNaN(partNumber) || partNumber < 1 || partNumber > 4) {
		console.error("Part number must be 1, 2, 3, or 4");
		process.exit(1);
	}

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("Missing DATABASE_URL environment variable");
		process.exit(1);
	}

	try {
		// Load data
		const chunksJson = await Bun.file(embeddedFile).text();
		const chunks: EmbeddedChunk[] = JSON.parse(chunksJson);
		console.log(`Loaded ${chunks.length} embedded chunks`);

		// Connect to database
		console.log("Connecting to database...");
		const db = createDbClient(databaseUrl);

		const items: Omit<SpecContent, "id">[] = chunks.map((chunk) => ({
			partNumber,
			sectionId: chunk.sectionId,
			title: chunk.sectionTitle,
			content: chunk.content,
			contentType: chunk.contentType,
			pageNumber: chunk.pageNumber,
			embedding: chunk.embedding,
		}));

		const batchSize = 50;
		const logProgress = (uploaded: number) => {
			if (uploaded % 200 === 0 || uploaded === items.length) {
				console.log(`  ${uploaded}/${items.length}`);
			}
		};

		if (append) {
			console.log("Uploading (append mode - existing rows for this part are kept)...");
			let uploaded = 0;
			for (let i = 0; i < items.length; i += batchSize) {
				const batch = items.slice(i, i + batchSize);
				await db.insertBatch(batch);
				uploaded += batch.length;
				logProgress(uploaded);
			}
		} else {
			console.log(`Replacing part ${partNumber} (delete + insert in one transaction)...`);
			const { deleted } = await db.replacePart(partNumber, items, {
				batchSize,
				onProgress: logProgress,
			});
			console.log(`  Removed ${deleted} existing row(s) for part ${partNumber}`);
		}

		// Get stats
		const stats = await db.getStats();
		console.log(`\nDone. Total: ${stats.total}, Embedded: ${stats.embedded}`);

		await db.close();
	} catch (error) {
		console.error("Upload failed:", error);
		process.exit(1);
	}
}

main();
