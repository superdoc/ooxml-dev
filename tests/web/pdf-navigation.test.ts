import { describe, expect, test } from "bun:test";
import {
	PDF_CONFIG,
	pdfUrlForPrintedPage,
	printedPageToSheet,
} from "../../apps/web/src/components/pdfNavigation";

describe("printedPageToSheet", () => {
	test("printed pages plus front matter equal the served PDF sheet counts", () => {
		const servedPdfSheets = { 1: 5026, 2: 137, 3: 44, 4: 1548 };

		for (const [part, sheets] of Object.entries(servedPdfSheets)) {
			const config = PDF_CONFIG[Number(part)];
			expect(config.totalPages + config.pageOffset).toBe(sheets);
		}
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
		expect(pdfUrlForPrintedPage(219, PDF_CONFIG[1])).toBe(
			"https://cdn.ooxml.dev/ecma-376/part1.pdf#page=229&toolbar=0&navpanes=0",
		);
	});
});
