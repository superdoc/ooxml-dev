#!/usr/bin/env python3
"""
Section heading detection for pymupdf4llm markdown output.

Shared by extract.py and fix-page-numbers.py so both agree on what a heading is.

pymupdf4llm emits headings in a few shapes depending on the version and on the
part being extracted:

    **12.3.2** **Title**              older releases, bold runs only
    # **12.3.2. Title**               newer releases prefix a markdown heading
    **Annex A** **(normative)**       annex number and qualifier as separate runs
    #### **Annex A (normative)**      annex heading collapsed into one run

Rather than trying to enumerate every combination, a candidate line is stripped
of its heading prefix and emphasis markers first, then matched as plain text.
That keeps `**` out of the parsed title, which is what leaked through before.
"""

import re

# pymupdf4llm marks real headings either with a markdown prefix or with bold.
# Body text and TOC entries are neither, which is what keeps them out.
HEADING_PREFIX_RE = re.compile(r"^#{1,6}\s+")
EMPHASIS_RE = re.compile(r"\*+|__")

NUMBERED_RE = re.compile(r"^(\d+(?:\.\d+)*)\.?\s+(.+)$")
ANNEX_RE = re.compile(r"^Annex\s+([A-Z])\b[.:]?\s*(.*)$", re.IGNORECASE)

# A heading's title starts with a word, a quote, or an annex qualifier like
# "(normative)". Anything else is a numeric run that only looks like a heading.
TITLE_START_RE = re.compile(r'^[A-Za-z(“"\']')


def strip_emphasis(text: str) -> str:
    """Remove markdown emphasis markers and collapse whitespace."""
    return re.sub(r"\s+", " ", EMPHASIS_RE.sub("", text)).strip()


def heading_text(line: str) -> str | None:
    """Return the plain text of a heading line, or None if it isn't one."""
    stripped = line.strip()
    if not stripped:
        return None

    is_heading = HEADING_PREFIX_RE.match(stripped) is not None
    body = HEADING_PREFIX_RE.sub("", stripped)
    if not is_heading and not body.startswith("**"):
        return None

    text = strip_emphasis(body)
    return text or None


def match_section_heading(line: str) -> tuple[str, str] | None:
    """
    Match a section heading line.

    Returns (section_id, title) with all emphasis markers removed, or None.
    Annex titles keep their qualifier: ("Annex A", "(normative) Namespaces").
    """
    text = heading_text(line)
    if text is None:
        return None

    annex = ANNEX_RE.match(text)
    if annex:
        letter, title = annex.groups()
        return f"Annex {letter.upper()}", title.strip()

    numbered = NUMBERED_RE.match(text)
    if numbered:
        section_id, title = numbered.groups()
        title = title.strip()
        if not TITLE_START_RE.match(title):
            return None
        return section_id, title

    return None


def is_title_continuation(line: str) -> str | None:
    """
    An annex heading is often split across lines, with the number and qualifier
    on one line and the annex name on the next:

        **Annex A** **(normative)**
        **Namespaces**

    Return the continuation's text if the line looks like that trailing run.
    """
    text = heading_text(line)
    if text is None:
        return None
    if match_section_heading(line) is not None:
        return None
    if re.match(r"^\d", text):
        return None
    return text


def needs_title_continuation(section_id: str, title: str) -> bool:
    """True when an annex heading carries no name beyond its qualifier."""
    if not section_id.startswith("Annex"):
        return False
    return title == "" or re.fullmatch(r"\([^)]*\)", title) is not None
