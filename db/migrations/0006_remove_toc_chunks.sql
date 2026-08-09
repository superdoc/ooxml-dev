-- Remove table-of-contents entries from the prose corpus.
--
-- extract.py matched section headings by their bold styling. In the ingested
-- markdown the contents listing is bold too, so every TOC line became its own
-- "section": a title, a section ID, leader dots, and the page number it points
-- at. Those rows were embedded and uploaded alongside real spec prose.
--
-- They are actively harmful to search. A TOC row is pure title text, so it
-- matches a title-shaped query better than the actual prose does and outranks
-- it - while carrying the page number of the contents listing itself, typically
-- 50-100 pages from the section it names. Measured across 12 representative
-- queries, 55% of returned results were TOC rows.
--
-- The matching fix is in scripts/ingest-pdf/extract.py (see `looks_like_toc`),
-- which keeps them out of future ingests. This migration clears the rows that
-- are already in the database.
--
-- Predicate: a short chunk that opens with a section ID and either carries
-- leader dots, or is a single unbroken line ending in a page number. Verified
-- against 459 production rows sampled across Part 1: 217 deleted, zero real
-- prose chunks caught, zero TOC rows left behind.
--
-- Idempotent: re-running deletes nothing further.

-- Dry run - inspect before applying:
--
--   SELECT part_number, count(*)
--   FROM spec_content
--   WHERE <the WHERE clause below>
--   GROUP BY part_number ORDER BY part_number;

DELETE FROM spec_content
WHERE length(btrim(content)) < 400
  -- opens with a section ID: "17.3.1.12 ..." or "**17.3.1.12** ..."
  AND btrim(content) ~ '^\*{0,2}[[:space:]]*[0-9]+(\.[0-9]+)*\.?\*{0,2}[[:space:]]'
  AND (
    -- leader dots are unambiguous
    btrim(content) ~ '\.{4,}'
    -- or a single unbroken line ending in a page number, for entries whose
    -- title ran long enough to swallow the dots. The blank-line test keeps
    -- real prose (which has paragraph breaks) out of the match.
    OR (
      btrim(content) ~ '[.[:space:]][0-9]{1,4}[[:space:]]*\*{0,2}$'
      AND strpos(content, E'\n\n') = 0
    )
  );
