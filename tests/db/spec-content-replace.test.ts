import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createDbClient, type DbClient } from "../../packages/shared/src/db";
import type { SpecContent } from "../../packages/shared/src/types";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const part = 901;

function chunk(content: string): Omit<SpecContent, "id"> {
	return {
		partNumber: part,
		sectionId: "17.3.1.12",
		title: "ind (Paragraph Indentation)",
		content,
		contentType: "text",
		pageNumber: 219,
	};
}

describeWithDatabase("replacePart", () => {
	let db: DbClient;

	beforeAll(() => {
		db = createDbClient(databaseUrl as string);
	});

	beforeEach(async () => {
		await db.sql`DELETE FROM spec_content WHERE part_number = ${part}`;
	});

	afterAll(async () => {
		await db.sql`DELETE FROM spec_content WHERE part_number = ${part}`;
		await db.close();
	});

	test("re-ingesting replaces the part instead of duplicating it", async () => {
		await db.replacePart(part, [chunk("old")]);
		const result = await db.replacePart(part, [chunk("new")]);

		const rows = await db.sql<{ content: string }[]>`
			SELECT content FROM spec_content WHERE part_number = ${part}
		`;

		expect(result).toEqual({ deleted: 1, inserted: 1 });
		expect(rows).toEqual([{ content: "new" }]);
	});

	test("refuses an empty replacement", async () => {
		await db.replacePart(part, [chunk("keep")]);
		await expect(db.replacePart(part, [])).rejects.toThrow("with no content");

		const rows = await db.sql<{ content: string }[]>`
			SELECT content FROM spec_content WHERE part_number = ${part}
		`;
		expect(rows).toEqual([{ content: "keep" }]);
	});

	test("rolls back when an insert fails", async () => {
		await db.replacePart(part, [chunk("keep")]);
		const invalid = { ...chunk("invalid"), content: null as unknown as string };
		await expect(db.replacePart(part, [invalid])).rejects.toThrow();

		const rows = await db.sql<{ content: string }[]>`
			SELECT content FROM spec_content WHERE part_number = ${part}
		`;
		expect(rows).toEqual([{ content: "keep" }]);
	});
});
