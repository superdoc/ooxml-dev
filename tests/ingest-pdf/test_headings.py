#!/usr/bin/env python3
"""
Tests for the section heading parsing in scripts/ingest-pdf/extract.py.

pymupdf4llm changes the markdown it emits between releases - a heading is bold
runs on older ones and an ATX heading on newer ones - so both shapes are
covered here, along with the lines that only look like headings: running
headers, contents listings and table rows.

Run with: bun run pdf:test
"""

import importlib.util
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# scripts/ingest-pdf isn't a package, so load extract.py by path.
spec = importlib.util.spec_from_file_location(
    "extract", REPO_ROOT / "scripts" / "ingest-pdf" / "extract.py"
)
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)

match_heading = extract.match_heading


class TestNumberedHeadings(unittest.TestCase):
    def test_bold_runs(self):
        self.assertEqual(
            match_heading("**17.3.1.24** **pStyle (Paragraph Style Reference)**"),
            ("17.3.1.24", "pStyle (Paragraph Style Reference)"),
        )

    def test_atx_heading(self):
        self.assertEqual(match_heading("# **12. Package Structure**"), ("12", "Package Structure"))
        self.assertEqual(
            match_heading("### **12.3.2. Main Document Part**"),
            ("12.3.2", "Main Document Part"),
        )
        self.assertEqual(match_heading("#### 17.3.1.24 pStyle"), ("17.3.1.24", "pStyle"))

    def test_title_never_keeps_emphasis_markers(self):
        for line in (
            "**17.3.1.24** **pStyle**",
            "## **17.3.1.24 pStyle**",
            "## 17.3.1.24 **pStyle**",
        ):
            _section_id, title = match_heading(line)
            self.assertNotIn("*", title, line)

    def test_ignores_contents_listing(self):
        self.assertIsNone(match_heading("17.3.2 Paragraphs .......... 264"))
        self.assertIsNone(match_heading("**17.3.2** **Paragraphs .......... 264**"))
        self.assertIsNone(match_heading("| **17.3.2** | Paragraphs | 264 |"))

    def test_keeps_real_heading_ending_in_a_number(self):
        self.assertEqual(match_heading("**12.3** **Changes in Part 1**"), ("12.3", "Changes in Part 1"))

    def test_ignores_running_header(self):
        # The header on every body page: the title isn't part of the bold run
        self.assertIsNone(match_heading("**17** . WordprocessingML Reference Material"))

    def test_ignores_body_text_and_bare_numbers(self):
        self.assertIsNone(match_heading("Some plain body paragraph."))
        self.assertIsNone(match_heading("**17.3.1.24**"))

    def test_ignores_numbered_example_lines(self):
        self.assertIsNone(match_heading("# **4 shrinks when it is clicked on.**"))
        self.assertIsNone(match_heading("###### 13 B.2.1.23 Worksheet Part"))

    def test_top_level_atx_heading_requires_its_period(self):
        self.assertEqual(match_heading("# **4. Terms and Definitions**"), ("4", "Terms and Definitions"))


class TestAnnexHeadings(unittest.TestCase):
    def test_qualifier_and_name_in_separate_runs(self):
        self.assertEqual(
            match_heading("**Annex A** **(normative)** **Namespaces**"),
            ("Annex A", "(normative) Namespaces"),
        )

    def test_collapsed_into_one_run(self):
        self.assertEqual(
            match_heading("#### **Annex B (informative) Bibliography**"),
            ("Annex B", "(informative) Bibliography"),
        )

    def test_qualifier_is_not_mistaken_for_the_name(self):
        # The old parser captured "(normative)" as the whole title, markers and all
        self.assertEqual(match_heading("**Annex A** **(normative)**"), ("Annex A", "(normative)"))

    def test_title_never_keeps_emphasis_markers(self):
        for line in (
            "**Annex A** **(normative)** **Namespaces**",
            "#### **Annex A (normative) Namespaces**",
            "**Annex A** **(normative)**",
        ):
            _section_id, title = match_heading(line)
            self.assertNotIn("*", title, line)

    def test_letter_is_normalised(self):
        self.assertEqual(
            match_heading("**annex c** **(informative) Notes**"),
            ("Annex C", "(informative) Notes"),
        )

    def test_ignores_running_header(self):
        # Annex pages repeat their number as the running header
        self.assertIsNone(match_heading("Annex A"))
        self.assertIsNone(match_heading("**Annex A**"))


class TestParseSections(unittest.TestCase):
    # Ben's result appeared once in the TOC and once as real prose.
    def test_ben_fixture_keeps_only_the_real_section(self):
        md = "\n".join(
            [
                extract.PAGE_MARKER.format(176),
                "**17.3.1.12** **ind (Paragraph Indentation) .......... 219**",
                extract.PAGE_MARKER.format(229),
                "#### 17.3.1.12 ind (Paragraph Indentation)",
                "This element specifies the set of indentation properties.",
            ]
        )

        sections = extract.parse_sections(md, page_offset=10)

        self.assertEqual(len(sections), 1)
        self.assertEqual(sections[0]["sectionId"], "17.3.1.12")
        self.assertEqual(sections[0]["pageStart"], 219)

    def test_annex_name_on_the_line_after_its_qualifier(self):
        md = "\n".join(
            [
                "**Annex A** **(normative)**",
                "",
                "**Namespaces**",
                "",
                "This annex lists the namespaces.",
            ]
        )

        sections = extract.parse_sections(md)

        self.assertEqual(len(sections), 1)
        self.assertEqual(sections[0]["sectionId"], "Annex A")
        self.assertEqual(sections[0]["title"], "(normative) Namespaces")
        self.assertEqual(sections[0]["depth"], 1)
        self.assertIsNone(sections[0]["parentId"])

    def test_annex_body_is_not_swallowed_as_a_title(self):
        md = "\n".join(
            [
                "**Annex A** **(normative)**",
                "",
                "This annex lists the namespaces.",
                "",
                "**More prose here.**",
            ]
        )

        sections = extract.parse_sections(md)

        self.assertEqual(sections[0]["title"], "(normative)")
        self.assertIn("This annex lists the namespaces.", sections[0]["content"])
        self.assertIn("More prose here.", sections[0]["content"])

    def test_sections_and_annexes_together(self):
        md = "\n".join(
            [
                "**17.3.1** **Paragraphs**",
                "Paragraph prose.",
                "**Annex A** **(normative)** **Namespaces**",
                "Annex prose.",
            ]
        )

        sections = extract.parse_sections(md)

        self.assertEqual(
            [(s["sectionId"], s["title"]) for s in sections],
            [("17.3.1", "Paragraphs"), ("Annex A", "(normative) Namespaces")],
        )
        self.assertEqual(sections[0]["parentId"], "17.3")

    def test_pages_come_from_the_page_markers(self):
        md = "\n".join(
            [
                extract.PAGE_MARKER.format(30),
                "**Annex A** **(normative)** **Namespaces**",
                "Annex prose.",
                extract.PAGE_MARKER.format(31),
                "More annex prose.",
            ]
        )

        sections = extract.parse_sections(md, page_offset=10)

        self.assertEqual(sections[0]["pageStart"], 20)
        self.assertEqual(sections[0]["pageEnd"], 21)


if __name__ == "__main__":
    unittest.main()
