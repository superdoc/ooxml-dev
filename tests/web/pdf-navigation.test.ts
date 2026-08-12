import { describe, expect, test } from "bun:test";
import {
	PDF_CONFIG,
	pdfUrlForPrintedPage,
	printedPageToSheet,
} from "../../apps/web/src/components/pdfNavigation";

describe("printedPageToSheet", () => {
	test("uses the printed page counts of the served PDFs", () => {
		expect(PDF_CONFIG[1].totalPages).toBe(5016);
		expect(PDF_CONFIG[2].totalPages).toBe(129);
		expect(PDF_CONFIG[3].totalPages).toBe(38);
		expect(PDF_CONFIG[4].totalPages).toBe(1534);
	});

	test("adds each PDF's front-matter offset", () => {
		expect(printedPageToSheet(1, PDF_CONFIG[1])).toBe(11);
		expect(printedPageToSheet(1, PDF_CONFIG[2])).toBe(9);
		expect(printedPageToSheet(1, PDF_CONFIG[3])).toBe(7);
		expect(printedPageToSheet(1, PDF_CONFIG[4])).toBe(15);
	});

	test("does not navigate past the last sheet", () => {
		expect(printedPageToSheet(10_000, PDF_CONFIG[3])).toBe(44);
	});

	test("builds the browser URL with the physical sheet", () => {
		expect(pdfUrlForPrintedPage(238, PDF_CONFIG[1])).toBe(
			"https://cdn.ooxml.dev/ecma-376/part1.pdf#page=248&toolbar=0&navpanes=0",
		);
	});
});
