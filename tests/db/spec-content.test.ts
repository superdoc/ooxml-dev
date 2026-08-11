/**
 * spec_content upload tests.
 *
 * These cover the re-ingest path: uploading a part used to append, so running
 * the PDF pipeline twice left two copies of every chunk for search to return.
 *
 * Sentinel part numbers (900+) are used throughout so the suite never touches
 * an ingested corpus sitting in the same dev database.
 *
 * Usage:
 *   TEST_DATABASE_URL=postgresql://... bun test tests/db/spec-content.test.ts
 */

import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createDbClient, type DbClient } from "../../packages/shared/src/db/index.ts";
import type { SpecContent } from "../../packages/shared/src/types/index.ts";

import { getTestDatabaseUrl } from "../test-db.ts";

const databaseUrl = getTestDatabaseUrl();

const PART = 901;
const OTHER_PART = 902;

let db: DbClient;

function chunk(partNumber: number, sectionId: string, content: string) {
	return {
		partNumber,
		sectionId,
		title: `Section ${sectionId}`,
		content,
		contentType: "text",
		pageNumber: 1,
	} satisfies Omit<SpecContent, "id">;
}

async function contentsOf(partNumber: number): Promise<string[]> {
	const rows = await db.sql<{ content: string }[]>`
		SELECT content FROM spec_content
		WHERE part_number = ${partNumber}
		ORDER BY id
	`;
	return rows.map((r) => r.content);
}

async function clearSentinelParts() {
	await db.sql`DELETE FROM spec_content WHERE part_number IN (${PART}, ${OTHER_PART})`;
}

beforeAll(() => {
	db = createDbClient(databaseUrl);
});

afterAll(async () => {
	await clearSentinelParts();
	await db.close();
});

beforeEach(clearSentinelParts);

test("replacePart leaves one copy of each chunk when a part is re-ingested", async () => {
	const first = [chunk(PART, "17.3.1", "first ingest a"), chunk(PART, "17.3.2", "first ingest b")];
	await db.replacePart(PART, first);

	const result = await db.replacePart(PART, [
		chunk(PART, "17.3.1", "second ingest a"),
		chunk(PART, "17.3.2", "second ingest b"),
	]);

	expect(result).toEqual({ deleted: 2, inserted: 2 });
	expect(await contentsOf(PART)).toEqual(["second ingest a", "second ingest b"]);
});

test("replacePart only touches the part it is given", async () => {
	await db.replacePart(OTHER_PART, [chunk(OTHER_PART, "1.1", "other part")]);

	await db.replacePart(PART, [chunk(PART, "17.3.1", "this part")]);

	expect(await contentsOf(OTHER_PART)).toEqual(["other part"]);
});

test("replacePart inserts across batch boundaries", async () => {
	const items = Array.from({ length: 5 }, (_, i) => chunk(PART, "17.3.1", `chunk ${i}`));
	const progress: number[] = [];

	const result = await db.replacePart(PART, items, {
		batchSize: 2,
		onProgress: (inserted) => progress.push(inserted),
	});

	expect(result.inserted).toBe(5);
	expect(progress).toEqual([2, 4, 5]);
	expect(await contentsOf(PART)).toHaveLength(5);
});

test("a failed replacePart leaves the previous ingest intact", async () => {
	await db.replacePart(PART, [chunk(PART, "17.3.1", "previous ingest")]);

	// content is NOT NULL, so this insert fails after the delete has run
	const broken = [{ ...chunk(PART, "17.3.1", ""), content: null as unknown as string }];
	await expect(db.replacePart(PART, broken)).rejects.toThrow();

	expect(await contentsOf(PART)).toEqual(["previous ingest"]);
});

test("insertBatch appends, for uploading a part in slices", async () => {
	await db.replacePart(PART, [chunk(PART, "17.3.1", "slice one")]);

	await db.insertBatch([chunk(PART, "17.3.2", "slice two")]);

	expect(await contentsOf(PART)).toEqual(["slice one", "slice two"]);
});
