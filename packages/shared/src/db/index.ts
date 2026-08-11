import postgres from "postgres";
import type { SearchResult, SpecContent } from "../types";

export type DbClient = ReturnType<typeof createDbClient>;

// biome-ignore lint/suspicious/noExplicitAny: postgres.js transaction handle
type Sql = any;

function toRow(item: Omit<SpecContent, "id">) {
	return {
		part_number: item.partNumber,
		section_id: item.sectionId,
		title: item.title,
		content: item.content,
		content_type: item.contentType,
		page_number: item.pageNumber,
		embedding: item.embedding ? `[${item.embedding.join(",")}]` : null,
	};
}

export function createDbClient(connectionString: string) {
	const sql = postgres(connectionString);

	return {
		sql,

		async close() {
			await sql.end();
		},

		// Insert content
		async insert(content: Omit<SpecContent, "id">) {
			const [result] = await sql<[{ id: number }]>`
				INSERT INTO spec_content (part_number, section_id, title, content, content_type, page_number, embedding)
				VALUES (
					${content.partNumber},
					${content.sectionId},
					${content.title},
					${content.content},
					${content.contentType},
					${content.pageNumber},
					${content.embedding ? `[${content.embedding.join(",")}]` : null}
				)
				RETURNING id
			`;
			return result.id;
		},

		// Insert multiple (batch)
		async insertBatch(items: Omit<SpecContent, "id">[]) {
			const values = items.map(toRow);

			const result = await sql`
				INSERT INTO spec_content ${sql(values)}
				RETURNING id
			`;
			return result.map((r) => r.id as number);
		},

		/**
		 * Replace a part's content in one transaction: the old rows go away and the
		 * new ones land together, so re-ingesting can't leave duplicates behind (and
		 * a failure part-way through leaves the previous ingest intact).
		 */
		async replacePart(
			partNumber: number,
			items: Omit<SpecContent, "id">[],
			options: { batchSize?: number; onProgress?: (inserted: number) => void } = {},
		): Promise<{ deleted: number; inserted: number }> {
			const { batchSize = 50, onProgress } = options;

			// postgres.js types TransactionSql without its tagged-template call
			// signature, so the transaction handle is loosely typed (as in
			// scripts/ingest-xsd/ingest.ts).
			return await sql.begin(async (tx: Sql) => {
				const deletedResult = await tx`
					DELETE FROM spec_content
					WHERE part_number = ${partNumber}
				`;

				let inserted = 0;
				for (let i = 0; i < items.length; i += batchSize) {
					const values = items.slice(i, i + batchSize).map(toRow);
					await tx`INSERT INTO spec_content ${tx(values)}`;
					inserted += values.length;
					onProgress?.(inserted);
				}

				return { deleted: deletedResult.count, inserted };
			});
		},

		// Update embedding
		async updateEmbedding(id: number, embedding: number[]) {
			await sql`
				UPDATE spec_content
				SET embedding = ${`[${embedding.join(",")}]`}
				WHERE id = ${id}
			`;
		},

		// Semantic search
		async search(
			queryEmbedding: number[],
			options: { limit?: number; partNumber?: number; contentType?: string } = {},
		): Promise<SearchResult[]> {
			const { limit = 5, partNumber, contentType } = options;
			const embeddingStr = `[${queryEmbedding.join(",")}]`;

			const results = await sql<
				Array<{
					id: number;
					part_number: number;
					section_id: string | null;
					title: string | null;
					content: string;
					content_type: string;
					page_number: number | null;
					score: number;
				}>
			>`
				SELECT
					id, part_number, section_id, title, content, content_type, page_number,
					1 - (embedding <=> ${embeddingStr}::vector) as score
				FROM spec_content
				WHERE embedding IS NOT NULL
				${partNumber ? sql`AND part_number = ${partNumber}` : sql``}
				${contentType ? sql`AND content_type = ${contentType}` : sql``}
				ORDER BY embedding <=> ${embeddingStr}::vector
				LIMIT ${limit}
			`;

			return results.map((r) => ({
				id: r.id,
				partNumber: r.part_number,
				sectionId: r.section_id,
				title: r.title,
				content: r.content,
				contentType: r.content_type,
				pageNumber: r.page_number,
				score: r.score,
			}));
		},

		// Get by section
		async getBySection(partNumber: number, sectionId: string): Promise<SpecContent[]> {
			const results = await sql<
				Array<{
					id: number;
					part_number: number;
					section_id: string | null;
					title: string | null;
					content: string;
					content_type: string;
					page_number: number | null;
				}>
			>`
				SELECT id, part_number, section_id, title, content, content_type, page_number
				FROM spec_content
				WHERE part_number = ${partNumber} AND section_id = ${sectionId}
				ORDER BY id
			`;

			return results.map((r) => ({
				id: r.id,
				partNumber: r.part_number,
				sectionId: r.section_id,
				title: r.title,
				content: r.content,
				contentType: r.content_type,
				pageNumber: r.page_number,
			}));
		},

		// Get stats
		async getStats() {
			const [stats] = await sql<[{ total: number; embedded: number }]>`
				SELECT
					COUNT(*) as total,
					COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedded
				FROM spec_content
			`;
			return {
				total: Number(stats.total),
				embedded: Number(stats.embedded),
			};
		},

		// Clear all
		async clearAll() {
			await sql`TRUNCATE spec_content RESTART IDENTITY`;
		},
	};
}
