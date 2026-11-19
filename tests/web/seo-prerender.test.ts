import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const fixtures: string[] = [];
const legacyDocs = [
	"docs", "docs/tables", "docs/paragraphs", "docs/styles", "docs/paragraph-borders",
	"docs/bidirectional-text", "docs/creating-documents", "docs/common-gotchas",
];
let builds: string[];

function prerenderAt(clock: string): string {
	const fixture = mkdtempSync(join(tmpdir(), "ooxml-seo-prerender-"));
	fixtures.push(fixture);
	for (const path of [
		"apps/web/scripts/prerender.ts", "apps/web/src/data/docs.ts", "apps/web/src/data/seo.ts",
	]) {
		const target = join(fixture, path);
		mkdirSync(dirname(target), { recursive: true });
		cpSync(join(root, path), target);
	}
	const dist = join(fixture, "apps/web/dist");
	mkdirSync(dist, { recursive: true });
	writeFileSync(join(dist, "index.html"), '<html><head><title>Template</title></head><body><div id="root"></div></body></html>');
	writeFileSync(join(fixture, "clock.mjs"), `
const NativeDate = Date;
const fixed = process.env.OOXML_TEST_BUILD_CLOCK;
class BuildDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [fixed])); }
  static now() { return NativeDate.parse(fixed); }
}
globalThis.Date = BuildDate;
`);
	const result = Bun.spawnSync({
		cmd: [process.execPath, "--preload", join(fixture, "clock.mjs"), "apps/web/scripts/prerender.ts"],
		cwd: fixture,
		env: { ...process.env, OOXML_TEST_BUILD_CLOCK: clock },
		stdout: "pipe", stderr: "pipe",
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return dist;
}

function html(dist: string, route = ""): string {
	return readFileSync(join(dist, route, "index.html"), "utf8");
}

function structuredData(markup: string): Record<string, any>[] {
	return [...markup.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
		.flatMap(match => {
			const value = JSON.parse(match[1]);
			return value["@graph"] ?? [value];
		});
}

beforeAll(() => { builds = [prerenderAt("2030-01-02T03:04:05Z"), prerenderAt("2031-06-07T08:09:10Z")]; });
afterAll(() => { for (const fixture of fixtures) rmSync(fixture, { recursive: true, force: true }); });

describe("published prerender metadata", () => {
	test("identifies the actual publisher and connects the homepage website", () => {
		const data = structuredData(html(builds[0]));
		const organization = data.find(node => node["@type"] === "Organization");
		const website = data.find(node => node["@type"] === "WebSite");
		expect(organization?.name).toBe("SuperDoc");
		expect(organization?.url).toBe("https://www.superdoc.dev");
		expect(website?.publisher?.["@id"]).toBe(organization?.["@id"]);
	});

	test("preserves all eight existing article dates across unrelated build clocks", () => {
		// Actual published values checked November 19, 2026. Content edits may deliberately update a page.
		for (const dist of builds) for (const route of legacyDocs) {
			const article = structuredData(html(dist, route)).find(node => node["@type"] === "TechArticle");
			expect(article?.datePublished, route).toBe("2025-03-15");
			expect(article?.dateModified, route).toBe("2026-11-11");
		}
	});

	test("uses the same real publisher on documentation and reference pages", () => {
		for (const route of [...legacyDocs, "cli", "mcp", "spec"]) {
			const data = structuredData(html(builds[0], route));
			const organization = data.find(node => node["@type"] === "Organization");
			const page = data.find(node => ["TechArticle", "WebPage"].includes(node["@type"]));
			expect(organization?.["@id"], route).toBe("https://www.superdoc.dev/#organization");
			expect(page?.publisher?.["@id"], route).toBe(organization?.["@id"]);
		}
	});

	test("retains canonical article URLs and keeps authentication and missing pages out of indexing", () => {
		for (const route of legacyDocs) {
			expect(html(builds[0], route)).toContain(`rel="canonical" href="https://ooxml.dev/${route}/"`);
		}
		for (const route of ["sign-in", "sign-up"]) {
			expect(html(builds[0], route)).toContain('name="robots" content="noindex, nofollow"');
			expect(readFileSync(join(builds[0], "sitemap.xml"), "utf8")).not.toContain(`/${route}`);
		}
		expect(readFileSync(join(builds[0], "404.html"), "utf8")).toContain('name="robots" content="noindex"');
	});
});
