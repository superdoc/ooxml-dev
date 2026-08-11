#!/usr/bin/env python3
"""
Tests for section heading parsing.

Run with: bun run pdf:test
"""

import importlib.util
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
INGEST_DIR = REPO_ROOT / "scripts" / "ingest-pdf"
sys.path.insert(0, str(INGEST_DIR))

from section_headings import match_section_heading  # noqa: E402

# extract.py isn't importable by name (the directory isn't a package)
spec = importlib.util.spec_from_file_location("extract", INGEST_DIR / "extract.py")
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)


class TestNumberedHeadings(unittest.TestCase):
    def test_bold_runs(self):
        self.assertEqual(
            match_section_heading("**17.3.1.24** **pStyle (Paragraph Style Reference)**"),
            ("17.3.1.24", "pStyle (Paragraph Style Reference)"),
        )

    def test_markdown_heading_prefix(self):
        self.assertEqual(
            match_section_heading("# **12. Package Structure**"),
            ("12", "Package Structure"),
        )
        self.assertEqual(
            match_section_heading("### **12.3.2. Main Document Part**"),
            ("12.3.2", "Main Document Part"),
        )

    def test_title_never_keeps_emphasis_markers(self):
        for line in (
            "**17.3.1.24** **pStyle**",
            "## **17.3.1.24 pStyle**",
            "**17.3.1.24** *pStyle*",
        ):
            _section_id, title = match_section_heading(line)
            self.assertNotIn("*", title, line)

    def test_ignores_toc_and_body_text(self):
        self.assertIsNone(match_section_heading("17.3.2 Paragraphs .......... 264"))
        self.assertIsNone(match_section_heading("Some plain body paragraph."))
        self.assertIsNone(match_section_heading("**17.3.1.24**"))
        # A bold run of numbers is not a section heading
        self.assertIsNone(match_section_heading("**1.2** **3.4**"))


class TestAnnexHeadings(unittest.TestCase):
    def test_qualifier_and_name_in_separate_runs(self):
        self.assertEqual(
            match_section_heading("**Annex A** **(normative)** **Namespaces**"),
            ("Annex A", "(normative) Namespaces"),
        )

    def test_collapsed_into_one_run(self):
        self.assertEqual(
            match_section_heading("#### **Annex B (informative) Bibliography**"),
            ("Annex B", "(informative) Bibliography"),
        )

    def test_qualifier_only_does_not_become_the_title(self):
        section_id, title = match_section_heading("**Annex A** **(normative)**")
        self.assertEqual(section_id, "Annex A")
        # The old parser saved "normative" here as if it were the annex name
        self.assertEqual(title, "(normative)")

    def test_letter_is_normalized(self):
        self.assertEqual(
            match_section_heading("**annex c** **(informative) Notes**"),
            ("Annex C", "(informative) Notes"),
        )


class TestParseSections(unittest.TestCase):
    def test_annex_title_continues_on_next_line(self):
        md = "\n".join(
            [
                "**Annex A** **(normative)**",
                "",
                "**Namespaces**",
                "",
                "This annex lists the namespaces.",
            ]
        )
        sections = extract.parse_sections(md, 1)
        self.assertEqual(len(sections), 1)
        self.assertEqual(sections[0]["sectionId"], "Annex A")
        self.assertEqual(sections[0]["title"], "(normative) Namespaces")
        self.assertEqual(sections[0]["depth"], 1)
        self.assertIsNone(sections[0]["parentId"])

    def test_body_text_is_not_swallowed_as_a_title(self):
        md = "\n".join(
            [
                "**Annex A** **(normative)**",
                "",
                "This annex lists the namespaces.",
                "",
                "**More prose here.**",
            ]
        )
        sections = extract.parse_sections(md, 1)
        self.assertEqual(sections[0]["title"], "(normative)")
        self.assertIn("This annex lists the namespaces.", sections[0]["content"])

    def test_sections_and_annexes_together(self):
        md = "\n".join(
            [
                "**17.3.1** **Paragraphs**",
                "Paragraph prose.",
                "**Annex A** **(normative)** **Namespaces**",
                "Annex prose.",
            ]
        )
        sections = extract.parse_sections(md, 1)
        self.assertEqual(
            [(s["sectionId"], s["title"]) for s in sections],
            [("17.3.1", "Paragraphs"), ("Annex A", "(normative) Namespaces")],
        )


if __name__ == "__main__":
    unittest.main()
