# PDF ingest (ECMA-376 prose corpus)

Builds the prose-search corpus that powers `ooxml_search` /
`ooxml_section` / `ooxml_parts`. Each ECMA-376 part PDF is extracted into
section-aware markdown, chunked at ~6 KB boundaries, embedded with Voyage,
and uploaded into `spec_content`.

```
PDF -> extract (Python) -> chunk (6KB, section-aware) -> embed -> upload
```

## Prerequisites

- Python with `pymupdf4llm`: `bun run pdf:setup`
- `DATABASE_URL` pointed at a Postgres with `db/schema.sql` applied
- `VOYAGE_API_KEY`. Search queries use `voyage-3`, so the corpus must use the
  same model and 1,024 dimensions.

## Run the full pipeline

```bash
bun run pdf:ingest 1 ./pdfs/ECMA-376-Part1.pdf
bun run pdf:ingest 2 ./pdfs/ECMA-376-Part2.pdf
bun run pdf:ingest 3 ./pdfs/ECMA-376-Part3.pdf
bun run pdf:ingest 4 ./pdfs/ECMA-376-Part4.pdf
```

Each run extracts to `data/extracted/partN/`, chunks to
`data/chunks/partN-chunks.json`, embeds to
`data/embedded/partN-embedded.json`, then replaces that part in one database
transaction. A failed upload rolls back, and an empty corpus is rejected.

Extraction records the physical PDF sheet for each page and derives the
printed page from the document's running headers. This keeps long sections on
their actual pages and excludes contents-list entries from the corpus.

## Run individual stages

```bash
bun run pdf:chunk    ./extracted/part1            ./chunks/part1.json
bun run pdf:audit    ./extracted/part1
bun run pdf:embed    ./chunks/part1.json          ./embedded/part1.json
bun run pdf:upload   1                            ./embedded/part1.json
```

Useful when iterating on chunking or trying a different embedding provider
without re-extracting.

## Files

- `pipeline.ts` - orchestrator (extract -> chunk -> embed -> upload)
- `extract.py` - PDF -> page-aware, section-aware markdown via pymupdf4llm
- `chunk.ts` - markdown -> page-aware 6 KB chunks with section IDs
- `audit.ts` - rejects duplicate sections, contents entries, and invalid pages
- `embed.ts` - chunks -> chunks + Voyage embeddings
- `upload.ts` - atomic part replacement in `spec_content`
