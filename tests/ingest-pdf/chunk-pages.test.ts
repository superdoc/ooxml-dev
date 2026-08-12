import { describe, expect, test } from "bun:test";
import { splitIntoChunks } from "../../scripts/ingest-pdf/chunk";

describe("PDF chunk page numbers", () => {
	test("uses the page marker where each chunk begins", () => {
		const firstPage = "A".repeat(5_900);
		const secondPage = "B".repeat(500);
		const thirdPage = "C".repeat(5_900);

		const chunks = splitIntoChunks(
			`<!--page:229-->\n\n${firstPage}\n\n<!--page:230-->\n\n${secondPage}\n\n<!--page:232-->\n\n${thirdPage}`,
			"17.3.1.12",
			"ind (Paragraph Indentation)",
			219,
			10,
		);

		expect(chunks.map((chunk) => chunk.pageNumber)).toEqual([219, 220, 222]);
		expect(chunks.every((chunk) => !chunk.content.includes("<!--page:"))).toBe(true);
		expect(chunks.every((chunk) => !chunk.embeddingText.includes("<!--page:"))).toBe(true);
	});
});
