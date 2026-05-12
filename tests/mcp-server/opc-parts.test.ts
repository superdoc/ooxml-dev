/**
 * Tests for `ooxml_package_part` and the curated OPC dataset.
 *
 * Static data, no DB. We exercise both the lookup helpers directly and
 * the tool dispatch in runOoxmlTool. SQL arg to the dispatch is a stub
 * because this tool's case never reaches the database.
 */

import { expect, test } from "bun:test";
import {
	findPartByContentType,
	findPartByRelationshipType,
	OPC_PARTS,
	type OpcPart,
	searchParts,
} from "../../apps/mcp-server/src/opc-parts.ts";
import { runOoxmlTool } from "../../apps/mcp-server/src/ooxml-tools.ts";

// runOoxmlTool's sql arg isn't touched by the ooxml_package_part case; an
// empty stub keeps the type happy without dragging in a DB.
const sqlStub = (() => {
	throw new Error("sql should not be called for ooxml_package_part");
}) as unknown as Parameters<typeof runOoxmlTool>[2];

test("OPC_PARTS dataset has unique keys and non-empty required fields", () => {
	const keys = new Set<string>();
	for (const p of OPC_PARTS) {
		expect(keys.has(p.key)).toBe(false);
		keys.add(p.key);
		expect(p.name.length).toBeGreaterThan(0);
		expect(p.contentType.length).toBeGreaterThan(0);
		expect(p.typicalPaths.length).toBeGreaterThan(0);
		expect(p.sourceSections.length).toBeGreaterThan(0);
		expect(p.packageFamilies.length).toBeGreaterThan(0);
	}
	// Sanity floor: every major Office family should be represented.
	const families = new Set(OPC_PARTS.flatMap((p) => p.packageFamilies));
	expect(families).toEqual(new Set(["wordprocessing", "spreadsheet", "presentation"]));
});

test("findPartByContentType: exact match for Word styles part", () => {
	const hit = findPartByContentType(
		"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
	);
	expect(hit?.key).toBe("wml-styles");
	expect(hit?.rootElement).toBe("styles");
});

test("findPartByContentType: returns null on miss", () => {
	expect(findPartByContentType("application/x-not-real")).toBeNull();
});

test("findPartByRelationshipType: exact match for customXmlProps", () => {
	const hit = findPartByRelationshipType(
		"http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps",
	);
	expect(hit?.key).toBe("custom-xml-data-properties");
	// Verifies the spec/XSD URI policy: the rootNamespace pins the XSD URI,
	// not the spec-prose URI (.../customXmlDataProps).
	expect(hit?.rootNamespace).toBe(
		"http://schemas.openxmlformats.org/officeDocument/2006/customXml",
	);
});

test("searchParts: empty query returns the full set", () => {
	const all = searchParts("");
	expect(all.length).toBe(OPC_PARTS.length);
});

test("searchParts: case-insensitive across name, namespace, notes", () => {
	const theme = searchParts("THEME");
	expect(theme.map((p) => p.key)).toContain("theme");

	// 'customXml' appears in name AND namespace AND notes for multiple parts.
	const customXml = searchParts("customXml");
	const keys = customXml.map((p) => p.key);
	expect(keys).toContain("custom-xml-data");
	expect(keys).toContain("custom-xml-data-properties");
});

test("ooxml_package_part: exact content_type returns full report", async () => {
	const out = await runOoxmlTool(
		"ooxml_package_part",
		{
			content_type:
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
		},
		sqlStub,
	);
	expect(out).toContain("## OPC Part: Main Document Part");
	expect(out).toContain("`wml-document`");
	expect(out).toContain("word/document.xml");
	expect(out).toContain("Part 1, §11.3.10");
	expect(out).toContain("wordprocessing");
});

test("ooxml_package_part: exact relationship_type matches the customXmlProps part", async () => {
	const out = await runOoxmlTool(
		"ooxml_package_part",
		{
			relationship_type:
				"http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps",
		},
		sqlStub,
	);
	expect(out).toContain("## OPC Part: Custom XML Data Storage Properties Part");
	// The spec/XSD divergence note is surfaced.
	expect(out).toContain("XSD targets");
});

test("ooxml_package_part: query substring returns a list table", async () => {
	const out = await runOoxmlTool("ooxml_package_part", { query: "slide" }, sqlStub);
	expect(out).toContain("Package parts matching 'slide'");
	expect(out).toContain("`pml-slide`");
	expect(out).toContain("`pml-slide-layout`");
	expect(out).toContain("`pml-slide-master`");
	// WML parts should be filtered out.
	expect(out).not.toContain("`wml-styles`");
});

test("ooxml_package_part: no args lists the full curated set", async () => {
	const out = await runOoxmlTool("ooxml_package_part", {}, sqlStub);
	expect(out).toContain("Curated OPC package parts");
	// Spot-check entries from each family.
	expect(out).toContain("`wml-document`");
	expect(out).toContain("`sml-workbook`");
	expect(out).toContain("`pml-presentation`");
	expect(out).toContain("`core-properties`");
});

test("ooxml_package_part: content_type miss surfaces helpful next steps", async () => {
	const out = await runOoxmlTool(
		"ooxml_package_part",
		{ content_type: "application/x-not-real" },
		sqlStub,
	);
	expect(out).toContain("Not found: OPC part with content type 'application/x-not-real'");
	expect(out).toContain("`ooxml_package_part` with a `query` substring");
	expect(out).toContain("`ooxml_search`");
});

test("ooxml_package_part: relationship_type miss surfaces helpful next steps", async () => {
	const out = await runOoxmlTool(
		"ooxml_package_part",
		{ relationship_type: "http://example.invalid/rel" },
		sqlStub,
	);
	expect(out).toContain("Not found: OPC part with relationship type 'http://example.invalid/rel'");
});

test("ooxml_package_part: empty query result surfaces 'no matches'", async () => {
	const out = await runOoxmlTool(
		"ooxml_package_part",
		{ query: "this-should-not-match-anything" },
		sqlStub,
	);
	expect(out).toContain("(no matches)");
	expect(out).toContain("ooxml_package_part` with no args");
});

test("OPC_PARTS keys follow the documented kebab-case shape", () => {
	for (const p of OPC_PARTS) {
		expect(p.key).toMatch(/^[a-z][a-z0-9-]*$/);
	}
});

test("OPC_PARTS family-specific keys are prefixed", () => {
	for (const p of OPC_PARTS as readonly OpcPart[]) {
		if (p.packageFamilies.length === 1) {
			const fam = p.packageFamilies[0];
			const expectedPrefix = fam === "wordprocessing" ? "wml-" : fam === "spreadsheet" ? "sml-" : "pml-";
			expect(p.key.startsWith(expectedPrefix)).toBe(true);
		}
	}
});
