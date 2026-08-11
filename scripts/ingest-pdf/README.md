# PDF ingest (ECMA-376 prose corpus)

Builds the prose-search corpus that powers `ooxml_search` /
`ooxml_section` / `ooxml_parts`. Each ECMA-376 part PDF is extracted into
section-aware markdown, chunked at ~6 KB boundaries, embedded with the
configured provider, and uploaded into `spec_content`.

```
PDF -> extract (Python) -> chunk (6KB, section-aware) -> embed -> upload
```

## Prerequisites

- Python with `pymupdf4llm`: `bun run pdf:setup`
- `DATABASE_URL` pointed at a Postgres with `db/schema.sql` applied
- An embedding provider key (one of):
  - `OPENAI_API_KEY` (default)
  - `VOYAGE_API_KEY`
  - `GOOGLE_API_KEY`
  - `COHERE_API_KEY`

## Run the full pipeline

```bash
bun run pdf:ingest 1 ./pdfs/ECMA-376-Part1.pdf
bun run pdf:ingest 2 ./pdfs/ECMA-376-Part2.pdf
bun run pdf:ingest 3 ./pdfs/ECMA-376-Part3.pdf
bun run pdf:ingest 4 ./pdfs/ECMA-376-Part4.pdf
```

Each run extracts to `dev/data/extracted/partN/`, chunks to
`dev/data/chunks/partN-chunks.json`, embeds to
`dev/data/embedded/partN-embedded.json`, then uploads.

Re-ingesting a part is safe: the upload deletes that part's existing rows and
inserts the new ones in a single transaction, so search never sees two copies of
the same passage. Pass `--append` to `pdf:upload` to keep the existing rows
(only useful when uploading one slice of a part at a time).

Databases ingested before that change may already hold duplicates. Clean them
with `db/migrations/0006_dedupe_spec_content.sql` (via `bun run db:migrate`).

## Run individual stages

```bash
bun run pdf:chunk    ./extracted/part1            ./chunks/part1.json
bun run pdf:embed    ./chunks/part1.json          ./embedded/part1.json
bun run pdf:upload   1                            ./embedded/part1.json
```

Useful when iterating on chunking or trying a different embedding provider
without re-extracting.

## Files

- `pipeline.ts` - orchestrator (extract -> chunk -> embed -> upload)
- `extract.py` - PDF -> section-aware markdown via pymupdf4llm
- `section_headings.py` - heading detection shared by `extract.py` and `fix-page-numbers.py`
- `fix-page-numbers.py` - PDF prelude-aware page-number alignment
- `chunk.ts` - markdown -> 6 KB chunks with section IDs
- `embed.ts` - chunks -> chunks + 1024-dim embeddings
- `upload.ts` - transactional replace (or `--append` insert) into `spec_content`

## Tests

```bash
bun run pdf:test
```

Covers heading parsing (numbered sections and annexes) against the markdown
shapes pymupdf4llm emits — bold runs on older releases, `#`-prefixed headings on
newer ones. No PDF or database needed.
