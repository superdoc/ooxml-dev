import { describe, expect, test } from "bun:test";
import { auditCorpus } from "../../scripts/ingest-pdf/audit";
import type { Chunk } from "../../scripts/ingest-pdf/chunk";

describe("PDF corpus audit", () => {
	test("rejects contents entries and invalid page data", () => {
		const badChunk: Chunk = {
			sectionId: "17.3.1.12",
			sectionTitle: "ind (Paragraph Indentation) .......... 219",
			content: "<!--page:229-->contents row",
			embeddingText: "contents row",
			contentType: "text",
			pageNumber: 229,
			chunkIndex: 0,
		};

		expect(() => auditCorpus([badChunk], 219)).toThrow();
	});
});
