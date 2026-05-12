/**
 * Query layer tests. Ingests the same fixture XSDs the ingest tests use,
 * then exercises each MCP-tool query function against the populated DB.
 */

import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createDbClient, type DbClient } from "../../packages/shared/src/db/index.ts";
import { ingestSchemaSet } from "../../scripts/ingest-xsd/ingest.ts";
import {
	findLocalNameAcrossNamespaces,
	getAttributes,
	getChildren,
	getEnums,
	getNamespaceInfo,
	listNamespaces,
	lookupElement,
	lookupSymbolByTypeRef,
	lookupType,
	parseQName,
} from "../../apps/mcp-server/src/ooxml-queries.ts";
import { runOoxmlTool } from "../../apps/mcp-server/src/ooxml-tools.ts";

const FIXTURES_DIR = join(import.meta.dir, "..", "ingest-xsd", "fixtures");
import { getTestDatabaseUrl } from "../test-db.ts";

const databaseUrl = getTestDatabaseUrl();

let db: DbClient;

const TRUNCATE_SQL = `
	TRUNCATE
		behavior_notes,
		xsd_enums,
		xsd_inheritance_edges,
		xsd_group_edges,
		xsd_attr_edges,
		xsd_child_edges,
		xsd_compositors,
		xsd_symbol_profiles,
		xsd_symbols,
		xsd_namespaces,
		xsd_profiles
	RESTART IDENTITY CASCADE
`;

beforeAll(async () => {
	db = createDbClient(databaseUrl);
	await db.sql`
		INSERT INTO reference_sources (name, kind)
		VALUES ('ecma-376-transitional', 'xsd')
		ON CONFLICT (name) DO NOTHING
	`;
	await db.sql.unsafe(TRUNCATE_SQL);
	await ingestSchemaSet({
		schemaDir: FIXTURES_DIR,
		entrypoints: ["main.xsd"],
		profileName: "transitional",
		sourceName: "ecma-376-transitional",
		db,
	});
});

afterAll(async () => {
	await db.sql.unsafe(TRUNCATE_SQL);
	await db.close();
});

const WML_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const SHARED_NS = "http://schemas.openxmlformats.org/officeDocument/2006/sharedTypes";

test("parseQName: prefixed, Clark, bare", () => {
	const a = parseQName("w:tbl");
	expect(a.ok).toBe(true);
	if (a.ok) {
		expect(a.qname.namespace).toBe(WML_NS);
		expect(a.qname.localName).toBe("tbl");
	}

	const b = parseQName("{http://example.com}foo");
	expect(b.ok).toBe(true);
	if (b.ok) {
		expect(b.qname.namespace).toBe("http://example.com");
		expect(b.qname.localName).toBe("foo");
	}

	const c = parseQName("CT_Tbl");
	expect(c.ok).toBe(true);
	if (c.ok) expect(c.qname.namespace).toBe(WML_NS); // bare default

	const d = parseQName("zzz:something");
	expect(d.ok).toBe(false);
});

test("parseQName: package-level and Microsoft extension prefixes resolve", () => {
	// ds: the spec PDF (Part 1 §15.2.6) cites .../customXmlDataProps, but the
	// shipped XSD targets .../customXml. We bind ds: to the XSD URI since
	// that's what the schema graph keys on; the prose URI is reachable via
	// ooxml_search / ooxml_section.
	const ds = parseQName("ds:datastoreItem");
	expect(ds.ok).toBe(true);
	if (ds.ok) {
		expect(ds.qname.namespace).toBe(
			"http://schemas.openxmlformats.org/officeDocument/2006/customXml",
		);
		expect(ds.qname.localName).toBe("datastoreItem");
	}

	const cp = parseQName("cp:coreProperties");
	expect(cp.ok).toBe(true);
	if (cp.ok) {
		expect(cp.qname.namespace).toBe(
			"http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
		);
	}

	const w14 = parseQName("w14:checksum");
	expect(w14.ok).toBe(true);
	if (w14.ok) {
		expect(w14.qname.namespace).toBe("http://schemas.microsoft.com/office/word/2010/wordml");
	}

	const dc = parseQName("dc:creator");
	expect(dc.ok).toBe(true);
	if (dc.ok) expect(dc.qname.namespace).toBe("http://purl.org/dc/elements/1.1/");
});

test("parseQName: unknown prefix error lists every known prefix", () => {
	const r = parseQName("nope:thing");
	expect(r.ok).toBe(false);
	if (!r.ok) {
		// Spot-check a few we just added; full list rendered by knownPrefixes().
		expect(r.reason).toContain("ds");
		expect(r.reason).toContain("w14");
		expect(r.reason).toContain("Clark form");
	}
});

test("lookupElement: top-level element with type_ref", async () => {
	const hit = await lookupElement(db.sql, WML_NS, "document", "transitional");
	expect(hit?.localName).toBe("document");
	expect(hit?.kind).toBe("element");
	expect(hit?.typeRef).toBe(`{${WML_NS}}CT_Empty`);
	expect(hit?.profileName).toBe("transitional");
	expect(hit?.namespaceUri).toBe(WML_NS);
});

test("lookupElement returns null for local-only names (no qname-addressable identity)", async () => {
	// 'text' is declared inline in CT_Para and is not a top-level <xsd:element>.
	// Per XSD it has no global qname; reach it via getChildren(CT_Para) instead.
	const hit = await lookupElement(db.sql, WML_NS, "text", "transitional");
	expect(hit).toBeNull();
});

test("lookupElement returns null for ambiguous local names (the tblGrid case)", async () => {
	// 'shared' is declared inline in CT_OuterA (type ST_Jc) and in CT_OuterB
	// (type xsd:string). Returning either would be wrong; lookupElement scopes
	// by parent_symbol_id IS NULL and refuses to pick one.
	const hit = await lookupElement(db.sql, WML_NS, "shared", "transitional");
	expect(hit).toBeNull();
});

test("lookupType: complexType vs simpleType disambiguation", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_Para", "transitional");
	expect(ct?.kind).toBe("complexType");

	const st = await lookupType(db.sql, WML_NS, "ST_Jc", "transitional");
	expect(st?.kind).toBe("simpleType");

	const sharedSt = await lookupType(db.sql, SHARED_NS, "ST_OnOff", "transitional");
	expect(sharedSt?.vocabularyId).toBe("shared-types");
});

test("lookupSymbolByTypeRef resolves Clark form", async () => {
	const hit = await lookupSymbolByTypeRef(db.sql, `{${WML_NS}}CT_Empty`, "transitional");
	expect(hit?.localName).toBe("CT_Empty");
	expect(hit?.kind).toBe("complexType");
});

test("getChildren: CT_Para has the local 'text' element via its sequence", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_Para", "transitional");
	if (!ct) throw new Error("CT_Para not found");
	const children = await getChildren(db.sql, ct.id, "transitional");
	expect(children).toHaveLength(1);
	expect(children[0].localName).toBe("text");
	expect(children[0].compositorKind).toBe("sequence");
	expect(children[0].source).toBe("self");
});

test("getChildren: CT_Body returns ordered mix of elements + group ref", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_Body", "transitional");
	if (!ct) throw new Error("CT_Body not found");
	const children = await getChildren(db.sql, ct.id, "transitional");
	// CT_Body content (top sequence): element ref="document", choice(group EG_PContent, element name="break")
	// getChildren returns the top sequence's edges; the nested choice's content is reachable via compositorId
	// pivot but not flattened automatically.
	const localNames = children.map((c) => c.localName).sort();
	expect(localNames).toContain("document");
	expect(localNames).toContain("EG_PContent");
	expect(localNames).toContain("break");
});

test("getChildren: inheritance is unioned (CT_Extended inherits from CT_Empty)", async () => {
	// CT_Extended extends CT_Empty (which has no content); CT_Extended itself has no
	// content model either, so children should be empty.
	const ct = await lookupType(db.sql, WML_NS, "CT_Extended", "transitional");
	if (!ct) throw new Error("CT_Extended not found");
	const children = await getChildren(db.sql, ct.id, "transitional");
	expect(children).toHaveLength(0);
});

test("getAttributes: CT_Para has 'bold' with type_ref to ST_OnOff", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_Para", "transitional");
	if (!ct) throw new Error("CT_Para not found");
	const attrs = await getAttributes(db.sql, ct.id, "transitional");
	const bold = attrs.find((a) => a.localName === "bold");
	expect(bold?.attrUse).toBe("optional");
	expect(bold?.typeRef).toBe(`{${SHARED_NS}}ST_OnOff`);
});

test("getAttributes: CT_TableUser unfolds AG_TableProps via attributeGroup ref", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_TableUser", "transitional");
	if (!ct) throw new Error("CT_TableUser not found");
	const attrs = await getAttributes(db.sql, ct.id, "transitional");
	const names = attrs.map((a) => a.localName).sort();
	// caption is direct, cols comes from AG_TableProps.
	expect(names).toContain("caption");
	expect(names).toContain("cols");

	const cols = attrs.find((a) => a.localName === "cols");
	expect(cols?.source).toBe("attributeGroup");
	expect(cols?.owningName).toBe("AG_TableProps");

	const caption = attrs.find((a) => a.localName === "caption");
	expect(caption?.attrUse).toBe("required");
});

test("getAttributes: CT_Extended inherits 'extra' (declared on the extension)", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_Extended", "transitional");
	if (!ct) throw new Error("CT_Extended not found");
	const attrs = await getAttributes(db.sql, ct.id, "transitional");
	const extra = attrs.find((a) => a.localName === "extra");
	expect(extra?.attrUse).toBe("optional");
	expect(extra?.typeRef).toBe("{http://www.w3.org/2001/XMLSchema}string");
});

test("getEnums: ST_Jc returns left/center/right in order", async () => {
	const st = await lookupType(db.sql, WML_NS, "ST_Jc", "transitional");
	if (!st) throw new Error("ST_Jc not found");
	const enums = await getEnums(db.sql, st.id, "transitional");
	expect(enums.map((e) => e.value)).toEqual(["left", "center", "right"]);
});

test("getNamespaceInfo: reports profile membership and vocabularies", async () => {
	const info = await getNamespaceInfo(db.sql, WML_NS);
	expect(info?.uri).toBe(WML_NS);
	expect(info?.vocabularies).toContain("wml-main");
	expect(info?.profiles.find((p) => p.name === "transitional")?.symbolCount).toBeGreaterThan(0);

	// Unknown URI → null
	const none = await getNamespaceInfo(db.sql, "http://example.com/does-not-exist");
	expect(none).toBeNull();
});

test("lookupElement: returns null for unknown qname", async () => {
	const hit = await lookupElement(db.sql, WML_NS, "doesNotExist", "transitional");
	expect(hit).toBeNull();
});

test("getChildren: extension prepends base content (CT_DerivedExtended -> alpha, beta, gamma)", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_DerivedExtended", "transitional");
	if (!ct) throw new Error("CT_DerivedExtended not found");
	const children = await getChildren(db.sql, ct.id, "transitional");
	const names = children.map((c) => c.localName);
	// XSD extension semantics: base content first, then derived.
	expect(names).toEqual(["alpha", "beta", "gamma"]);
	// Provenance distinguishes base-derived from self-derived.
	expect(children[0].source).toBe("inherited");
	expect(children[0].owningTypeName).toBe("CT_BaseWithChildren");
	expect(children[2].source).toBe("self");
	expect(children[2].owningTypeName).toBe("CT_DerivedExtended");
});

test("getChildren: nested compositor flatten preserves document order (CT_NestedOrder)", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_NestedOrder", "transitional");
	if (!ct) throw new Error("CT_NestedOrder not found");
	const children = await getChildren(db.sql, ct.id, "transitional");
	// Top sequence: head, choice(branchA, branchB), tail.
	// Document order should be head, branchA, branchB, tail (NOT branchA first because
	// its order_index=0 inside the choice).
	const names = children.map((c) => c.localName);
	expect(names).toEqual(["head", "branchA", "branchB", "tail"]);

	// Compositor path makes the nesting visible.
	const head = children.find((c) => c.localName === "head");
	expect(head?.compositorPath).toEqual(["sequence(1..1)"]);

	const branchA = children.find((c) => c.localName === "branchA");
	expect(branchA?.compositorPath).toEqual(["sequence(1..1)", "choice(0..unbounded)"]);
});

test("local element symbols are scoped per-owner (no cross-CT collapse)", async () => {
	// Mirrors the WML tblGrid case (CT_TblGridBase inside CT_TblGridChange vs
	// CT_TblGrid inside CT_Tbl). CT_OuterA / CT_OuterB both declare an inline
	// 'shared' element but with different @type. They must produce distinct
	// per-parent symbols, each carrying its own type_ref.
	const ctA = await lookupType(db.sql, WML_NS, "CT_OuterA", "transitional");
	const ctB = await lookupType(db.sql, WML_NS, "CT_OuterB", "transitional");
	if (!ctA || !ctB) throw new Error("CT_OuterA / CT_OuterB not found");

	const aChildren = await getChildren(db.sql, ctA.id, "transitional");
	const bChildren = await getChildren(db.sql, ctB.id, "transitional");
	expect(aChildren).toHaveLength(1);
	expect(bChildren).toHaveLength(1);
	expect(aChildren[0].localName).toBe("shared");
	expect(bChildren[0].localName).toBe("shared");

	// The two `shared` symbols carry different type_refs.
	const sharedSymbols = await db.sql`
		SELECT s.id, s.type_ref, s.parent_symbol_id, parent.local_name AS parent_name
		FROM xsd_symbols s
		JOIN xsd_symbols parent ON parent.id = s.parent_symbol_id
		WHERE s.local_name = 'shared' AND s.kind = 'element'
		ORDER BY parent.local_name
	`;
	expect(sharedSymbols).toHaveLength(2);
	expect(sharedSymbols[0].parent_name).toBe("CT_OuterA");
	expect(sharedSymbols[0].type_ref).toBe(`{${WML_NS}}ST_Jc`);
	expect(sharedSymbols[1].parent_name).toBe("CT_OuterB");
	expect(sharedSymbols[1].type_ref).toBe("{http://www.w3.org/2001/XMLSchema}string");
});

test("xsd-builtin symbols have profile membership (lookupSymbolByTypeRef can follow xsd:string)", async () => {
	// Built-ins like xsd:string are auto-created during inheritance resolution and
	// must be linked to xsd_symbol_profiles, otherwise ooxml_type for
	// 'xsd:string' and lookupSymbolByTypeRef for {...XMLSchema}string return null.
	const t = await lookupSymbolByTypeRef(
		db.sql,
		"{http://www.w3.org/2001/XMLSchema}string",
		"transitional",
	);
	expect(t).not.toBeNull();
	expect(t?.localName).toBe("string");
	expect(t?.vocabularyId).toBe("xsd-builtin");
});

test("getAttributes: complexContent/restriction inherits base attributes", async () => {
	// CT_TrackedRestricted restricts CT_TrackedBase but redeclares nothing.
	// Per XSD §3.4.2.2 the base's attribute uses are inherited; restriction can
	// narrow or prohibit but cannot drop silently.
	const ct = await lookupType(db.sql, WML_NS, "CT_TrackedRestricted", "transitional");
	if (!ct) throw new Error("CT_TrackedRestricted not found");
	const attrs = await getAttributes(db.sql, ct.id, "transitional");
	const names = attrs.map((a) => a.localName).sort();
	expect(names).toEqual(["author", "id"]);

	const idAttr = attrs.find((a) => a.localName === "id");
	expect(idAttr?.attrUse).toBe("required");
	expect(idAttr?.source).toBe("inherited");
	expect(idAttr?.owningName).toBe("CT_TrackedBase");
});

test("getAttributes: derived redeclaration wins over inherited base attribute", async () => {
	// CT_OverrideDerived restricts CT_TrackedBase and overrides 'id' from
	// required to optional. The derived's redeclaration must win; the base's
	// 'author' should still be inherited unchanged.
	const ct = await lookupType(db.sql, WML_NS, "CT_OverrideDerived", "transitional");
	if (!ct) throw new Error("CT_OverrideDerived not found");
	const attrs = await getAttributes(db.sql, ct.id, "transitional");

	const idAttr = attrs.find((a) => a.localName === "id");
	expect(idAttr?.attrUse).toBe("optional");
	expect(idAttr?.source).toBe("self");
	expect(idAttr?.owningName).toBe("CT_OverrideDerived");

	const authorAttr = attrs.find((a) => a.localName === "author");
	expect(authorAttr?.attrUse).toBe("optional");
	expect(authorAttr?.source).toBe("inherited");
});

test("getAttributes: nested attributeGroup chain unfolds (CT_NestedAttrUser -> innerAttr + outerAttr)", async () => {
	const ct = await lookupType(db.sql, WML_NS, "CT_NestedAttrUser", "transitional");
	if (!ct) throw new Error("CT_NestedAttrUser not found");
	const attrs = await getAttributes(db.sql, ct.id, "transitional");
	const names = attrs.map((a) => a.localName).sort();
	// CT_NestedAttrUser refs AG_Outer; AG_Outer refs AG_Inner.
	// Both attributes must surface.
	expect(names).toEqual(["innerAttr", "outerAttr"]);

	const inner = attrs.find((a) => a.localName === "innerAttr");
	expect(inner?.source).toBe("attributeGroup");
	expect(inner?.owningName).toBe("AG_Inner");

	const outer = attrs.find((a) => a.localName === "outerAttr");
	expect(outer?.source).toBe("attributeGroup");
	expect(outer?.owningName).toBe("AG_Outer");
});

test("element-to-type chain: lookup w-style element, follow type_ref, fetch children", async () => {
	// document → CT_Empty (no content) ⇒ children empty.
	const elem = await lookupElement(db.sql, WML_NS, "document", "transitional");
	expect(elem).not.toBeNull();
	if (!elem?.typeRef) throw new Error("expected type_ref");
	const type = await lookupSymbolByTypeRef(db.sql, elem.typeRef, "transitional");
	expect(type?.localName).toBe("CT_Empty");
	const children = await getChildren(db.sql, type!.id, "transitional");
	expect(children).toHaveLength(0);
});

test("listNamespaces: no query returns every ingested namespace with profile/vocab info", async () => {
	const all = await listNamespaces(db.sql);
	const uris = all.map((n) => n.uri).sort();
	expect(uris).toContain(WML_NS);
	expect(uris).toContain(SHARED_NS);
	const wml = all.find((n) => n.uri === WML_NS);
	expect(wml?.vocabularies).toContain("wml-main");
	expect(wml?.profiles.find((p) => p.name === "transitional")?.symbolCount).toBeGreaterThan(0);
});

test("listNamespaces: query is a case-insensitive substring of the URI", async () => {
	const wml = await listNamespaces(db.sql, { query: "WORDPROCESSINGML" });
	expect(wml.map((n) => n.uri)).toEqual([WML_NS]);

	const shared = await listNamespaces(db.sql, { query: "sharedTypes" });
	expect(shared.map((n) => n.uri)).toEqual([SHARED_NS]);

	const none = await listNamespaces(db.sql, { query: "this-does-not-exist" });
	expect(none).toHaveLength(0);
});

test("findLocalNameAcrossNamespaces: surfaces hits across vocabularies and kinds", async () => {
	// `document` is a top-level element in WML. With no kind filter, the
	// element should show up as a candidate.
	const hits = await findLocalNameAcrossNamespaces(db.sql, "document", "transitional");
	const elementHit = hits.find((h) => h.kind === "element");
	expect(elementHit?.vocabularyId).toBe("wml-main");
	expect(elementHit?.namespaceUri).toBe(WML_NS);

	// Kind filter narrows the result set.
	const typesOnly = await findLocalNameAcrossNamespaces(db.sql, "document", "transitional", {
		kind: "simpleType",
	});
	expect(typesOnly).toHaveLength(0);
});

test("ooxml_namespace: no args lists ingested namespaces in a markdown table", async () => {
	const out = await runOoxmlTool("ooxml_namespace", {}, db.sql);
	expect(out).toContain("Ingested namespaces");
	expect(out).toContain(WML_NS);
	expect(out).toContain("wml-main");
	expect(out).toContain("| uri |");
});

test("ooxml_namespace: query filters to substring matches", async () => {
	const out = await runOoxmlTool("ooxml_namespace", { query: "sharedTypes" }, db.sql);
	expect(out).toContain(`Namespaces matching 'sharedTypes'`);
	expect(out).toContain(SHARED_NS);
	// Other namespaces should be filtered out.
	expect(out).not.toContain(WML_NS);
});

test("ooxml_namespace: exact URI returns full report", async () => {
	const out = await runOoxmlTool("ooxml_namespace", { uri: WML_NS }, db.sql);
	expect(out).toContain(`## Namespace ${WML_NS}`);
	expect(out).toContain("wml-main");
	expect(out).toContain("transitional:");
});

test("ooxml_namespace: exact URI miss falls back to last-segment substring search", async () => {
	// The fallback uses the URI's last path segment, NOT the whole URI. The
	// motivating case (.../customXmlDataProps vs .../customXml) is *not*
	// expected to resolve through this fallback - that needs an alias table.
	// What the fallback IS good for: variations on an ingested URI.
	const ghostUri = `${WML_NS}/oops-not-real`;
	const out = await runOoxmlTool("ooxml_namespace", { uri: ghostUri }, db.sql);
	expect(out).toContain(`Namespace URI '${ghostUri}' not found exactly`);
	// `oops-not-real` shouldn't match any ingested URI. Both the "no near
	// match" line AND the alias-resolution disclaimer should appear, so the
	// agent isn't left thinking the fallback can bridge spec/XSD URI drift.
	expect(out).toContain("No near-matches");
	expect(out).toContain("no alias resolution");
});

test("ooxml_namespace: exact URI miss with a near-segment match surfaces neighbors", async () => {
	// Use a URI whose last segment IS an ingested namespace's last segment
	// ('main' is common to WML / DML / SML once those are ingested). With
	// only WML fixtures ingested, the last segment 'main' will match WML.
	const ghostUri = "http://example.invalid/something/main";
	const out = await runOoxmlTool("ooxml_namespace", { uri: ghostUri }, db.sql);
	expect(out).toContain(`Namespace URI '${ghostUri}' not found exactly`);
	expect(out).toContain("Showing substring matches for 'main'");
	expect(out).toContain(WML_NS);
	// And the disclaimer about missing alias resolution should still appear.
	expect(out).toContain("No alias resolution");
});

test("ooxml_element: kind-filtered not-found suppresses did-you-mean when no elements match", async () => {
	// CT_Para is a complexType, not a top-level element. ooxml_element scopes
	// its did-you-mean query to `kind: "element"` so the complexType is
	// intentionally NOT surfaced as a suggestion - it isn't a viable
	// substitute for a missing element. The block stays hidden in that case.
	const out = await runOoxmlTool("ooxml_element", { qname: "w:CT_Para" }, db.sql);
	expect(out).toContain("Not found: element CT_Para");
	expect(out).not.toContain("Other top-level symbols");
});

test("ooxml_type: not-found shows 'Other top-level symbols' when only an element exists", async () => {
	// 'document' exists as an element in WML but not as a type. ooxml_type
	// should miss and the did-you-mean (no kind filter) should surface the
	// element under the renamed heading.
	const out = await runOoxmlTool("ooxml_type", { qname: "w:document" }, db.sql);
	expect(out).toContain("Not found: type document");
	expect(out).toContain("Other top-level symbols named `document`");
	expect(out).toContain("element `document` in wml-main");
});
