import postgres from "postgres";
import type { SearchResult, SpecContent } from "../types";

export type DbClient = ReturnType<typeof createDbClient>;

type ReplacementContent = Omit<SpecContent, "id"> & { sourceId: number };

function specContentRow(item: ReplacementContent) {
	return {
		part_number: item.partNumber,
		section_id: item.sectionId,
		title: item.title,
		content: item.content,
		content_type: item.contentType,
		page_number: item.pageNumber,
		embedding: item.embedding ? `[${item.embedding.join(",")}]` : null,
		source_id: item.sourceId,
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
			const values = items.map((item) => ({
				part_number: item.partNumber,
				section_id: item.sectionId,
				title: item.title,
				content: item.content,
				content_type: item.contentType,
				page_number: item.pageNumber,
				embedding: item.embedding ? `[${item.embedding.join(",")}]` : null,
			}));

			const result = await sql`
				INSERT INTO spec_content ${sql(values)}
				RETURNING id
			`;
			return result.map((r) => r.id as number);
		},

		async replacePart(
			partNumber: number,
			items: ReplacementContent[],
		): Promise<{ deleted: number; inserted: number }> {
			if (items.length === 0) {
				throw new Error(`Refusing to replace Part ${partNumber} with no content`);
			}
			if (items.some((item) => item.partNumber !== partNumber)) {
				throw new Error(`Replacement content must all belong to Part ${partNumber}`);
			}

			return sql.begin(async (tx) => {
				// postgres.js transaction handles are callable at runtime, but its
				// TransactionSql type drops the call signature through Omit.
				const transaction = tx as unknown as typeof sql;
				await transaction`SELECT pg_advisory_xact_lock(376, ${partNumber})`;
				const deleted =
					await transaction`DELETE FROM spec_content WHERE part_number = ${partNumber}`;
				const batchSize = 50;
				for (let index = 0; index < items.length; index += batchSize) {
					const batch = items.slice(index, index + batchSize).map(specContentRow);
					await transaction`INSERT INTO spec_content ${transaction(batch)}`;
				}

				return { deleted: deleted.count, inserted: items.length };
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
