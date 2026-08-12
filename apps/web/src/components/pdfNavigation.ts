export interface PdfConfig {
	url: string;
	totalPages: number;
	pageOffset: number;
	name: string;
}

// Search results use the page number printed in the spec, while browser PDF
// fragments address physical sheets, including unnumbered front matter.
export const PDF_CONFIG: Record<number, PdfConfig> = {
	1: {
		url: "https://cdn.ooxml.dev/ecma-376/part1.pdf",
		totalPages: 5016,
		pageOffset: 10,
		name: "Fundamentals",
	},
	2: {
		url: "https://cdn.ooxml.dev/ecma-376/part2.pdf",
		totalPages: 129,
		pageOffset: 8,
		name: "OPC",
	},
	3: {
		url: "https://cdn.ooxml.dev/ecma-376/part3.pdf",
		totalPages: 38,
		pageOffset: 6,
		name: "Compatibility",
	},
	4: {
		url: "https://cdn.ooxml.dev/ecma-376/part4.pdf",
		totalPages: 1534,
		pageOffset: 14,
		name: "Transitional",
	},
};

export function printedPageToSheet(printedPage: number, config: PdfConfig): number {
	const clampedPage = Math.max(1, Math.min(printedPage, config.totalPages));
	return clampedPage + config.pageOffset;
}

export function pdfUrlForPrintedPage(printedPage: number, config: PdfConfig): string {
	const sheet = printedPageToSheet(printedPage, config);
	return `${config.url}#page=${sheet}&toolbar=0&navpanes=0`;
}
