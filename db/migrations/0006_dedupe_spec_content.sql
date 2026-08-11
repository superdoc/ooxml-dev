-- Remove duplicate spec_content rows left behind by earlier re-ingests.
--
-- upload.ts used to append unconditionally, so running the PDF pipeline twice
-- for the same part inserted a second copy of every chunk and semantic search
-- returned the same passage more than once. Uploads now replace a part inside a
-- transaction; this migration cleans up databases ingested before that change.
--
-- Duplicates are exact repeats of the same passage in the same part; the row
-- with the lowest id survives. Rows that merely share a section (a section is
-- chunked into several rows) are left alone.
--
-- Idempotent: re-running deletes nothing once the table is clean.

DELETE FROM spec_content s
USING spec_content keep
WHERE s.id > keep.id
  AND s.part_number = keep.part_number
  AND s.content = keep.content
  AND s.section_id IS NOT DISTINCT FROM keep.section_id
  AND s.content_type IS NOT DISTINCT FROM keep.content_type;
