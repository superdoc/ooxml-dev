import { expect, test } from "bun:test";
import { runOoxmlTool } from "../../apps/mcp-server/src/ooxml-tools.ts";
import { extractPresetShapeGuides } from "../../scripts/generate-preset-shape-guides.ts";

const sqlStub = (() => {
	throw new Error("SQL should not be called by ooxml_preset_shape");
}) as unknown as Parameters<typeof runOoxmlTool>[2];

test("returns the two guide names required by round2SameRect", async () => {
	const output = await runOoxmlTool("ooxml_preset_shape", { shape: "round2SameRect" }, sqlStub);

	expect(output).toContain("`adj1`, `adj2`");
	expect(output).toContain("Fourth Edition");
});

test("distinguishes shapes without guides from invalid shape names", async () => {
	const noGuides = await runOoxmlTool("ooxml_preset_shape", { shape: "rect" }, sqlStub);
	const invalid = await runOoxmlTool("ooxml_preset_shape", { shape: "notARealShape" }, sqlStub);

	expect(noGuides).toContain("has no adjust guides");
	expect(invalid).toContain("Preset shape not found");
	expect(invalid).not.toContain("has no adjust guides");
});

test("does not accept preset text-warp names as preset shapes", async () => {
	const output = await runOoxmlTool("ooxml_preset_shape", { shape: "textArchDown" }, sqlStub);

	expect(output).toContain("Preset shape not found");
});

test("extracts guide names from Annex D XML and deduplicates identical definitions", () => {
	const xml = `<?xml version="1.0"?>
		<presetShapeDefinitons>
			<round2SameRect><avLst><gd name="adj1"/><gd name="adj2"/></avLst></round2SameRect>
			<rect><avLst/></rect>
			<rect><avLst/></rect>
		</presetShapeDefinitons>`;

	expect(extractPresetShapeGuides(xml)).toEqual([
		{ name: "round2SameRect", guides: ["adj1", "adj2"] },
		{ name: "rect", guides: [] },
	]);
});

test("rejects conflicting duplicate definitions in Annex D XML", () => {
	const xml = `<presetShapeDefinitons>
		<rect><avLst/></rect>
		<rect><avLst><gd name="adj"/></avLst></rect>
	</presetShapeDefinitons>`;

	expect(() => extractPresetShapeGuides(xml)).toThrow("Conflicting Annex D definitions for rect");
});
