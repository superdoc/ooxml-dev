# Migrations

Each phase that changes the schema adds one numbered SQL file here. Files are applied in lexical order (`0001_*.sql`, `0002_*.sql`, ...).

## Conventions

- **Tracked**: `schema_migrations` records each applied filename and SHA-256 checksum.
- **Immutable**: never edit an applied file. The runner rejects checksum drift; add a new migration instead.
- **Tracked from creation**: fresh databases are initialized from `db/schema.sql`, which records every migration already represented by that schema snapshot.
- **Forward-only**: no `down` scripts. Reverting means writing a new migration.
- **Source of truth split**:
  - `db/schema.sql` reflects the full schema after all migrations are applied. Used by `docker-compose` to initialize fresh dev databases via `db:reset`.
  - Migration files are for incrementally upgrading existing databases (production / long-lived dev).

## Applying migrations

Apply every pending migration against an existing database:

```bash
bun run db:migrate
```

The runner holds a PostgreSQL advisory lock, applies pending files in one transaction, and records their checksums atomically. Production deploys run it before either the web app or MCP Worker is published, so a migration failure stops the release.

The runner refuses to replay migration history when `schema_migrations` is missing. Before using it with a database created before migration tracking, verify that database's schema and explicitly baseline its existing migrations.

Production requires `DATABASE_URL` as a GitHub Actions repository secret in addition to the Worker secret of the same name.

## Adding a new migration

1. Pick the next number (`0002`, `0003`, ...).
2. Write idempotent SQL.
3. Update `db/schema.sql` to match the new full state.
4. Add the migration filename and checksum to the fresh-database baseline in `db/schema.sql`.
5. If the migration introduces curated data (e.g., source rows), let a script populate it (e.g., `scripts/sources-sync.ts`), not the SQL file.
