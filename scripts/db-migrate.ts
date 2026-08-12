/**
 * Apply pending db/migrations/*.sql files against $DATABASE_URL.
 *
 * Applied filenames and checksums are recorded in schema_migrations. The
 * checksum makes migration files immutable after release: schema changes must
 * be added in a new migration instead of rewriting production history.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createDbClient } from "../packages/shared/src/db/index.ts";

export interface Migration {
	name: string;
	checksum: string;
	content: string;
}

export interface AppliedMigration {
	name: string;
	checksum: string;
}

export function migrationChecksum(content: string): string {
	return new Bun.CryptoHasher("sha256").update(content).digest("hex");
}

export async function readMigrations(directory = "./db/migrations"): Promise<Migration[]> {
	const files = readdirSync(directory)
		.filter((file) => file.endsWith(".sql"))
		.sort();

	return Promise.all(
		files.map(async (name) => {
			const content = await Bun.file(join(directory, name)).text();
			return { name, checksum: migrationChecksum(content), content };
		}),
	);
}

export function pendingMigrations(
	migrations: Migration[],
	appliedMigrations: AppliedMigration[],
): Migration[] {
	const available = new Map(migrations.map((migration) => [migration.name, migration]));

	for (const applied of appliedMigrations) {
		const migration = available.get(applied.name);
		if (!migration) {
			throw new Error(
				`Database migration ${applied.name} does not exist in this checkout. Restore the file before deploying.`,
			);
		}
		if (migration.checksum !== applied.checksum) {
			throw new Error(
				`Database migration ${applied.name} changed after it was applied. Add a new migration instead of editing it.`,
			);
		}
	}

	const appliedNames = new Set(appliedMigrations.map((migration) => migration.name));
	return migrations.filter((migration) => !appliedNames.has(migration.name));
}

export async function migrate(databaseUrl: string, directory = "./db/migrations"): Promise<number> {
	const migrations = await readMigrations(directory);
	if (migrations.length === 0) {
		console.log("No migration files found.");
		return 0;
	}

	const db = createDbClient(databaseUrl);
	try {
		return await db.sql.begin(async (sql) => {
			// Serialize production deploys before reading or changing migration state.
			await sql`SELECT pg_advisory_xact_lock(hashtext('ooxml.dev:db-migrate'))`;
			await sql`
				CREATE TABLE IF NOT EXISTS schema_migrations (
					name TEXT PRIMARY KEY,
					checksum TEXT NOT NULL,
					applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
				)
			`;

			const applied = await sql<AppliedMigration[]>`
				SELECT name, checksum
				FROM schema_migrations
				ORDER BY name
			`;
			const pending = pendingMigrations(migrations, applied);

			for (const migration of pending) {
				console.log(`Applying ${migration.name}...`);
				await sql.unsafe(migration.content);
				await sql`
					INSERT INTO schema_migrations (name, checksum)
					VALUES (${migration.name}, ${migration.checksum})
				`;
			}

			console.log(
				pending.length === 0
					? "Database is up to date."
					: `Applied ${pending.length} migration(s).`,
			);
			return pending.length;
		});
	} finally {
		await db.close();
	}
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("Missing DATABASE_URL environment variable");
	}

	await migrate(databaseUrl);
}

if (import.meta.main) {
	main().catch((error) => {
		console.error("Migration failed:", error);
		process.exit(1);
	});
}
