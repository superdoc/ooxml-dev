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

## Run individual stages

```bash
bun run pdf:chunk    ./extracted/part1            ./chunks/part1.json
bun run pdf:embed    ./chunks/part1.json          ./embedded/part1.json
bun run pdf:upload   1                            ./embedded/part1.json
```

Useful when iterating on chunking or trying a different embedding provider
without re-extracting.

## Page numbers

These PDFs carry two numbering systems, and mixing them up sends every search
result to the wrong page:

- **physical page** - the sheet index, what a viewer's `#page=N` addresses.
- **printed page** - the number in the running header, which restarts at 1
  after the roman-numeral front matter.

`extract.py` extracts with `page_chunks=True`, so each line's physical page is
known exactly rather than guessed from stray digits in the text. It measures the
front-matter offset from the running headers and writes it to
`metadata.json` as `pageOffset`.

`spec_content.page_number` stores the **printed** page - the number a reader
sees on the page and cites. `PdfViewer` adds the part's `pageOffset` back when
building the `#page=` fragment.

Every extraction run prints the `totalPages` / `pageOffset` pair for that part.
When a PDF is replaced (a new edition, a re-paginated release), copy those two
numbers into `PDF_CONFIG` in `apps/web/src/components/PdfViewer.tsx`.

Section bodies keep inline `<!--page:N-->` markers so `chunk.ts` can attribute
each chunk to the page it actually falls on rather than to its section's first
page. The markers are stripped from stored content and embedding text.

## Files

- `pipeline.ts` - orchestrator (extract -> chunk -> embed -> upload)
- `extract.py` - PDF -> section-aware markdown via pymupdf4llm
- `chunk.ts` - markdown -> 6 KB chunks with section IDs
- `embed.ts` - chunks -> chunks + 1024-dim embeddings
- `upload.ts` - bulk insert into `spec_content`
