import { describe, expect, test } from "bun:test";
import {
	type AppliedMigration,
	type Migration,
	assertMigrationTrackingInitialized,
	migrationChecksum,
	pendingMigrations,
} from "../../scripts/db-migrate.ts";

function migration(name: string, content: string): Migration {
	return { name, content, checksum: migrationChecksum(content) };
}

describe("tracked database migrations", () => {
	const migrations = [
		migration("0001_first.sql", "CREATE TABLE first (id INT);"),
		migration("0002_second.sql", "CREATE TABLE second (id INT);"),
	];

	test("returns only migrations that have not been applied", () => {
		const applied: AppliedMigration[] = [
			{ name: migrations[0].name, checksum: migrations[0].checksum },
		];

		expect(pendingMigrations(migrations, applied)).toEqual([migrations[1]]);
	});

	test("rejects an applied migration whose contents changed", () => {
		const applied: AppliedMigration[] = [
			{ name: migrations[0].name, checksum: migrationChecksum("old contents") },
		];

		expect(() => pendingMigrations(migrations, applied)).toThrow(
			"changed after it was applied",
		);
	});

	test("rejects database history that is missing from the checkout", () => {
		const applied: AppliedMigration[] = [{ name: "0000_missing.sql", checksum: "checksum" }];

		expect(() => pendingMigrations(migrations, applied)).toThrow(
			"does not exist in this checkout",
		);
	});

	test("rejects an untracked database instead of replaying old migrations", () => {
		expect(() => assertMigrationTrackingInitialized(false, 0)).toThrow(
			"Database migration tracking is not initialized",
		);
		expect(() => assertMigrationTrackingInitialized(true, 0)).toThrow(
			"Database migration tracking is not initialized",
		);
		expect(() => assertMigrationTrackingInitialized(true, 1)).not.toThrow();
	});

	test("uses stable SHA-256 checksums", () => {
		expect(migrationChecksum("same contents")).toBe(migrationChecksum("same contents"));
		expect(migrationChecksum("same contents")).not.toBe(migrationChecksum("changed contents"));
		expect(migrationChecksum("same contents")).toHaveLength(64);
	});
});
