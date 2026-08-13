import { expect, test } from "bun:test";
import { parseArguments } from "../../apps/cli/src/arguments";

test("maps OOXML commands to the internal query operations", () => {
	expect(parseArguments(["search", "paragraph spacing", "--part", "1", "--limit", "3"])).toEqual({
		name: "query",
		tool: "ooxml_search",
		input: { query: "paragraph spacing", part: 1, limit: 3 },
	});
	expect(parseArguments(["element", "w:p"])).toEqual({
		name: "query",
		tool: "ooxml_element",
		input: { qname: "w:p" },
	});
	expect(parseArguments(["attributes", "w:p", "--profile", "transitional"])).toEqual({
		name: "query",
		tool: "ooxml_attributes",
		input: { qname: "w:p", profile: "transitional" },
	});
	expect(parseArguments(["namespace", "drawingml"])).toEqual({
		name: "query",
		tool: "ooxml_namespace",
		input: { query: "drawingml" },
	});
	expect(parseArguments(["package-part", "customXml"])).toEqual({
		name: "query",
		tool: "ooxml_package_part",
		input: { query: "customXml" },
	});
	expect(parseArguments(["preset-shape", "round2SameRect"])).toEqual({
		name: "query",
		tool: "ooxml_preset_shape",
		input: { shape: "round2SameRect" },
	});
});

test("rejects invalid numeric options", () => {
	expect(() => parseArguments(["search", "paragraph", "--part", "5"])).toThrow(
		"--part must be an integer between 1 and 4",
	);
	expect(() => parseArguments(["search", "paragraph", "--limit", "0"])).toThrow(
		"--limit must be an integer between 1 and 20",
	);
});

test("does not expose raw MCP tool calls", () => {
	expect(() => parseArguments(["call", "ooxml_element"])).toThrow("Unknown command: call");
	expect(() => parseArguments(["tools"])).toThrow("Unknown command: tools");
});

test("rejects command names inherited from Object", () => {
	for (const command of ["toString", "constructor", "__proto__"]) {
		expect(() => parseArguments([command, "w:p"])).toThrow(`Unknown command: ${command}`);
	}
});
