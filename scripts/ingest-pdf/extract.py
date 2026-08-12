#!/usr/bin/env python3
"""
PDF Text Extraction using pymupdf4llm

Extracts text from ECMA-376 PDF files with proper markdown formatting.
Produces cleaner output than pdf.js with code fences and table formatting.

Page numbers
------------
Two numbering systems exist in these PDFs and conflating them is what made
every search result open on the wrong page:

  * physical page - the sheet index a PDF viewer addresses via `#page=N`.
  * printed page  - the number printed in the running header, which starts
                    over at 1 after the roman-numeral front matter.

We extract with `page_chunks=True`, so every line's physical page is known
exactly rather than inferred from stray digits in the text. The printed page
is then derived as `physical - page_offset`, where the offset is measured
from the running headers (see `detect_page_offset`).

`spec_content.page_number` stores the *printed* page, because that is the
number a reader sees on the page and cites. The web viewer adds the part's
offset back when it builds the `#page=` fragment.

Section content keeps inline `<!--page:N-->` markers so the chunker can
attribute each chunk to the page it actually falls on.

Usage:
    python scripts/ingest-pdf/extract.py <pdf-path> <output-dir> [--pages START-END]

Example:
    python scripts/ingest-pdf/extract.py ./pdfs/ECMA-376-Part1.pdf ./extracted/part1
    python scripts/ingest-pdf/extract.py ./pdfs/ECMA-376-Part1.pdf ./extracted/part1 --pages 100-200
"""

import sys
import json
import re
import os
from collections import Counter
from pathlib import Path


# Inline marker recording the physical page a run of lines came from.
PAGE_MARKER = "<!--page:{}-->"
PAGE_MARKER_RE = re.compile(r"^<!--page:(\d+)-->$")


def detect_page_offset(doc) -> int:
    """
    Measure how many sheets precede printed page 1.

    Every body page prints its number in the running header, within the first
    few lines. `physical - printed` is constant across the document, so we take
    the modal vote and ignore pages where no number is found (front matter,
    full-bleed figures).
    """
    votes: Counter[int] = Counter()

    for index in range(doc.page_count):
        printed = printed_page_in_header(doc[index].get_text())
        if printed is not None:
            votes[(index + 1) - printed] += 1

    if not votes:
        return 0

    offset, agreed = votes.most_common(1)[0]
    total = sum(votes.values())
    print(f"Page offset: {offset} (agreement {agreed}/{total} pages with a header number)")

    if agreed / total < 0.9:
        print(f"  WARNING: header page numbers disagree; runners-up {votes.most_common(4)[1:]}")

    return offset


def printed_page_in_header(page_text: str) -> int | None:
    """Return the page number printed in the running header, if present."""
    lines = [line.strip() for line in page_text.split("\n")[:6] if line.strip()]

    for line in lines[:3]:
        if re.fullmatch(r"\d{1,4}", line):
            return int(line)

    return None


def extract_pdf(pdf_path: str, output_dir: str, page_range: tuple[int, int] | None = None):
    """Extract PDF to markdown using pymupdf4llm."""
    import pymupdf4llm
    import pymupdf

    print(f"Loading PDF: {pdf_path}")

    doc = pymupdf.open(pdf_path)
    total_pages = doc.page_count

    print(f"PDF loaded: {total_pages} pages")

    page_offset = detect_page_offset(doc)

    # Determine pages to process (0-based indices for pymupdf)
    if page_range:
        start_page, end_page = page_range
        pages = list(range(start_page - 1, min(end_page, total_pages)))
        print(f"Processing pages {start_page} to {min(end_page, total_pages)}")
    else:
        pages = list(range(total_pages))
        print(f"Processing all {total_pages} pages")

    # Extract per page so each line's physical page is known exactly.
    print("Extracting text...")
    page_chunks = pymupdf4llm.to_markdown(
        pdf_path,
        pages=pages,
        page_chunks=True,
        show_progress=True,
    )

    doc.close()

    md_text = assemble_markdown(page_chunks, pages)

    # Create output directory
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Save raw markdown (page markers included - they are HTML comments)
    md_path = Path(output_dir) / "content.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_text)
    print(f"Saved markdown to {md_path}")

    # Parse sections from markdown
    sections = parse_sections(md_text, page_offset)

    # Save sections
    sections_path = Path(output_dir) / "sections.json"
    with open(sections_path, "w", encoding="utf-8") as f:
        json.dump(sections, f, indent=2)
    print(f"Saved {len(sections)} sections to {sections_path}")

    # Save section index (without content)
    section_index = [{
        "sectionId": s["sectionId"],
        "title": s["title"],
        "depth": s["depth"],
        "parentId": s["parentId"],
        "pageStart": s["pageStart"],
        "pageEnd": s["pageEnd"],
        "contentLength": len(s["content"]),
    } for s in sections]

    index_path = Path(output_dir) / "section-index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(section_index, f, indent=2)

    # Save metadata
    metadata = {
        "totalPages": total_pages,
        "printedPages": max(1, total_pages - page_offset),
        "processedPages": len(pages),
        "pageRange": list(page_range) if page_range else None,
        "pageOffset": page_offset,
        "sectionsFound": len(sections),
        "contentLength": len(md_text),
    }

    metadata_path = Path(output_dir) / "metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print("\nExtraction complete!")
    print(f"  Total pages: {total_pages}")
    print(f"  Processed pages: {len(pages)}")
    print(f"  Page offset: {page_offset} (printed page = physical page - {page_offset})")
    print(f"  Sections found: {len(sections)}")
    print(f"  Content size: {len(md_text):,} chars")
    print("\n  Set pageOffset in apps/web/src/components/pdfNavigation.ts PDF_CONFIG to "
          f"{page_offset} and totalPages to {max(1, total_pages - page_offset)} for this part.")

    return md_text, sections


def assemble_markdown(page_chunks, pages: list[int]) -> str:
    """Join per-page markdown, prefixing each page with its physical page marker."""
    parts = []

    for position, chunk in enumerate(page_chunks):
        metadata = chunk.get("metadata") or {}
        physical = metadata.get("page_number", metadata.get("page"))

        # Fall back to the requested page list if the key is absent or renamed.
        if not isinstance(physical, int):
            physical = pages[position] + 1 if position < len(pages) else position + 1

        parts.append(f"\n\n{PAGE_MARKER.format(physical)}\n\n{chunk.get('text', '')}")

    return "".join(parts)


# Section heading patterns. Both forms have been emitted by pymupdf4llm across
# versions, so match either rather than depending on the bold styling alone.
HEADING_PATTERNS = [
    # Bold: **12.3.2** **Title**
    #
    # The title must be bold too. The running header on every page reads
    # `**17** . WordprocessingML Reference Material` - an unbolded title - and
    # accepting it would turn every page into a bogus section 17.
    re.compile(r"^\*\*(\d+(?:\.\d+)*)\*\*\s*\*\*([^*]+)\*\*$"),
    # ATX: #### 12.3.2 Title  /  ### 12.3.2. Title  (optionally bolded)
    re.compile(r"^#+\s*\*{0,2}(\d+(?:\.\d+)*)\.?\s+(.+?)\*{0,2}$"),
]

# A real heading's title starts with a word. Running headers and stray
# numbering fragments start with punctuation.
TITLE_STARTS_WITH_WORD_RE = re.compile(r"^[A-Za-z0-9(]")

# An annex number, its qualifier and its name arrive as one bold run on some
# pymupdf4llm releases and as three on others:
#
#     **Annex A** **(normative)** **Namespaces**
#     #### **Annex A (normative) Namespaces**
#
# Matching the runs individually meant a new marker arrangement leaked `**`
# into the stored title, so emphasis is stripped before the match instead. The
# title keeps the qualifier: ("Annex A", "(normative) Namespaces").
ANNEX_PATTERN = re.compile(r"^Annex\s+([A-Z])\b[.:]?\s*(.*)$", re.IGNORECASE)

# An annex whose name spilled onto the next line carries only its qualifier.
ANNEX_QUALIFIER_ONLY_RE = re.compile(r"\([^)]*\)")

HEADING_PREFIX_RE = re.compile(r"^#{1,6}\s*")
EMPHASIS_RE = re.compile(r"\*+|__")

# A table-of-contents entry: leader dots and/or a trailing page number.
# These render bold in some pymupdf4llm versions and so are indistinguishable
# from real headings by styling alone - they must be rejected by shape.
TOC_LEADER_RE = re.compile(r"\.{2,}")
TOC_TRAILING_PAGE_RE = re.compile(r"[.\s]\d{1,4}\s*$")


def strip_emphasis(text: str) -> str:
    """Drop markdown emphasis markers and collapse the whitespace they leave."""
    return re.sub(r"\s+", " ", EMPHASIS_RE.sub("", text)).strip()


def heading_body(stripped: str) -> str:
    """A heading line as plain text: no ATX prefix, no emphasis markers."""
    return strip_emphasis(HEADING_PREFIX_RE.sub("", stripped))


def has_heading_markup(stripped: str) -> bool:
    """True when a line is styled as a heading (ATX prefix or a bold run)."""
    return stripped.startswith("#") or stripped.startswith("**")


def looks_like_toc(title: str, raw_line: str) -> bool:
    """True when a heading candidate is really a contents-listing entry."""
    if TOC_LEADER_RE.search(raw_line):
        return True

    # No leader dots, but still "Title 1047" - a contents entry whose title
    # ran long enough to swallow the dots.
    return bool(TOC_TRAILING_PAGE_RE.search(title))


def match_heading(stripped: str) -> tuple[str, str] | None:
    """Return (section_id, title) for a real section heading, else None."""
    # Markdown table rows are contents listings in these PDFs, never headings.
    if stripped.startswith("|"):
        return None

    # A heading carries markdown emphasis. Annex pages repeat a bare "Annex A"
    # as their running header, which is not a heading.
    if not has_heading_markup(stripped):
        return None

    annex = ANNEX_PATTERN.match(heading_body(stripped))
    if annex:
        title = annex.group(2).strip()
        if not title or looks_like_toc(title, stripped):
            return None
        return f"Annex {annex.group(1).upper()}", title

    for pattern in HEADING_PATTERNS:
        match = pattern.match(stripped)
        if not match:
            continue

        section_id, title = match.group(1), strip_emphasis(match.group(2) or "")
        # Real top-level ATX headings use `# 4. Terms...`. Lines such as
        # `#4 shrinks...` and numbered RELAX NG examples can otherwise look
        # like sections after markdown extraction.
        if stripped.startswith("#") and "." not in section_id:
            body = heading_body(stripped)
            if not re.match(rf"^{re.escape(section_id)}\.\s", body):
                return None
        if not title or not TITLE_STARTS_WITH_WORD_RE.match(title):
            return None
        if looks_like_toc(title, stripped):
            return None
        return section_id, title

    return None


def needs_title_continuation(section_id: str, title: str) -> bool:
    """
    True when an annex heading carries no name beyond its qualifier.

    `**Annex A** **(normative)**` with `**Namespaces**` on the following line is
    one heading split in two, so the name is picked up by `title_continuation`.
    """
    if not section_id.lower().startswith("annex"):
        return False

    return ANNEX_QUALIFIER_ONLY_RE.fullmatch(title) is not None


def title_continuation(stripped: str) -> str | None:
    """
    Return the trailing run of a heading whose title spilled onto the next line.

    Only a styled run that doesn't open with a number qualifies, which keeps the
    annex body - and the next heading - out of the title.
    """
    if not has_heading_markup(stripped) or match_heading(stripped) is not None:
        return None

    text = heading_body(stripped)
    if not text or not TITLE_STARTS_WITH_WORD_RE.match(text) or text[0].isdigit():
        return None

    return text


def parse_sections(md_text: str, page_offset: int = 0) -> list[dict]:
    """
    Parse section structure from markdown text.

    `page_offset` converts the physical pages recorded in the page markers into
    the printed page numbers stored in the database.
    """
    sections = []

    lines = md_text.split("\n")
    current_section = None
    current_content: list[str] = []
    current_physical = 1
    awaiting_title = False

    def printed_page() -> int:
        return max(1, current_physical - page_offset)

    for line in lines:
        stripped = line.strip()

        marker = PAGE_MARKER_RE.match(stripped)
        if marker:
            current_physical = int(marker.group(1))
            # Keep the marker in the section body so the chunker can advance
            # its page as it walks the content. Pad with blank lines so the
            # marker survives as its own paragraph when the body is re-split.
            if current_section:
                current_content.extend(["", stripped, ""])
            continue

        heading = match_heading(stripped)

        # An annex name can land on the line after its number and qualifier.
        # Only the first non-blank line after such a heading is considered, so
        # the annex body can never be mistaken for the rest of the title.
        if heading is None and awaiting_title and stripped:
            awaiting_title = False
            continuation = title_continuation(stripped)
            if continuation:
                current_section["title"] = f"{current_section['title']} {continuation}".strip()
                current_content.append(line)
                continue

        if heading:
            # Save previous section
            if current_section:
                current_section["content"] = "\n".join(current_content).strip()
                current_section["pageEnd"] = printed_page()
                sections.append(current_section)

            section_id, title = heading

            if section_id.lower().startswith("annex"):
                depth = 1
            else:
                depth = section_id.count(".") + 1

            current_section = {
                "sectionId": section_id,
                "title": title,
                "pageStart": printed_page(),
                "pageEnd": printed_page(),
                "content": "",
                "depth": depth,
                "parentId": get_parent_section_id(section_id),
            }
            current_content = [line]
            awaiting_title = needs_title_continuation(section_id, title)
        elif current_section:
            current_content.append(line)

    # Don't forget the last section
    if current_section:
        current_section["content"] = "\n".join(current_content).strip()
        current_section["pageEnd"] = printed_page()
        sections.append(current_section)

    return sections


def get_parent_section_id(section_id: str) -> str | None:
    """Get parent section ID from a section ID."""
    if section_id.lower().startswith("annex"):
        return None

    parts = section_id.split(".")
    if len(parts) <= 1:
        return None

    return ".".join(parts[:-1])


def main():
    args = sys.argv[1:]

    if len(args) < 2:
        print("Usage: python scripts/ingest-pdf/extract.py <pdf-path> <output-dir> [--pages START-END]")
        print("")
        print("Example:")
        print("  python scripts/ingest-pdf/extract.py ./pdfs/ECMA-376-Part1.pdf ./extracted/part1")
        print("  python scripts/ingest-pdf/extract.py ./pdfs/ECMA-376-Part1.pdf ./extracted/part1 --pages 100-200")
        sys.exit(1)

    pdf_path = args[0]
    output_dir = args[1]

    # Parse page range if provided
    page_range = None
    if len(args) > 2 and args[2] == "--pages":
        if len(args) > 3:
            try:
                start, end = args[3].split("-")
                page_range = (int(start), int(end))
            except ValueError:
                print(f"Invalid page range: {args[3]}")
                print("Expected format: START-END (e.g., 100-200)")
                sys.exit(1)

    if not os.path.exists(pdf_path):
        print(f"ERROR: PDF not found: {pdf_path}")
        sys.exit(1)

    try:
        extract_pdf(pdf_path, output_dir, page_range)
    except Exception as e:
        print(f"Extraction failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
