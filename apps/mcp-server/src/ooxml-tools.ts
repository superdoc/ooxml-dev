/**
 * Read-only structural MCP tools backed by the OOXML schema graph.
 *
 * Tools:
 *   ooxml_element, ooxml_type, ooxml_children,
 *   ooxml_attributes, ooxml_enum, ooxml_namespace.
 *
 * Default profile is `transitional`. Future profiles (e.g. word-compatible-docx)
 * will compose Transitional with Office extension schemas.
 */

import { neon } from "@neondatabase/serverless";
import type { ToolDef } from "./mcp";
import {
	type AttrEntry,
	type ChildEdge,
	type EnumEntry,
	findLocalNameAcrossNamespaces,
	getAttributes,
	getChildren,
	getEnums,
	getNamespaceInfo,
	knownPrefixes,
	type LocalNameHit,
	listNamespaces,
	lookupElement,
	lookupSymbol,
	lookupSymbolByTypeRef,
	lookupType,
	type NamespaceInfo,
	parseQName,
	type SymbolHit,
} from "./ooxml-queries";
import {
	contentTypesOf,
	findPartByContentType,
	findPartsByRelationshipType,
	type OpcPart,
	searchParts,
} from "./opc-parts";

export const DEFAULT_PROFILE = "transitional";

export interface OoxmlEnv {
	DATABASE_URL: string;
}

const QNAME_HELP =
	"Accepts 'w:tbl', '{namespace}localName' (Clark form), or bare 'localName' (defaults to wml-main). " +
	"Backed by the XSD schema graph: elements documented only in spec prose (Part 1 §15.x package parts, " +
	"some appendix tables) won't resolve here. Fall back to ooxml_search or ooxml_section for prose lookups.";

export const OOXML_TOOL_DEFS: ToolDef[] = [
	{
		name: "ooxml_element",
		description: `Look up an OOXML element by qname in a profile. Returns canonical symbol info (vocabulary, namespace, declared @type, profile membership, source). ${QNAME_HELP}`,
		inputSchema: {
			type: "object" as const,
			properties: {
				qname: { type: "string", description: "Element qname, e.g. 'w:tbl' or '{...}tbl'." },
				profile: {
					type: "string",
					description: "Profile name (default: 'transitional').",
				},
			},
			required: ["qname"],
		},
	},
	{
		name: "ooxml_type",
		description: `Look up a complexType or simpleType by qname in a profile. Tries complexType first, then simpleType. ${QNAME_HELP}`,
		inputSchema: {
			type: "object" as const,
			properties: {
				qname: { type: "string", description: "Type qname, e.g. 'w:CT_Tbl' or 'CT_Tbl'." },
				profile: { type: "string", description: "Profile name (default: 'transitional')." },
			},
			required: ["qname"],
		},
	},
	{
		name: "ooxml_children",
		description: `List the legal children of an element or complexType in document order. For an element, follows @type to its complexType first. Walks inheritance to union content from base types. Group refs are surfaced as-is; resolve them by calling ooxml_children on the group qname. ${QNAME_HELP}`,
		inputSchema: {
			type: "object" as const,
			properties: {
				qname: {
					type: "string",
					description:
						"Element, complexType, or group qname (e.g. 'w:tbl', 'CT_Tbl', 'EG_PContent').",
				},
				profile: { type: "string", description: "Profile name (default: 'transitional')." },
			},
			required: ["qname"],
		},
	},
	{
		name: "ooxml_attributes",
		description: `List the attributes of an element or complexType. For an element, follows @type to its complexType first. Walks inheritance and unfolds attributeGroup refs recursively. Each entry includes use (required/optional/prohibited), default, fixed, and type_ref. ${QNAME_HELP}`,
		inputSchema: {
			type: "object" as const,
			properties: {
				qname: { type: "string", description: "Element or complexType qname." },
				profile: { type: "string", description: "Profile name (default: 'transitional')." },
			},
			required: ["qname"],
		},
	},
	{
		name: "ooxml_enum",
		description: `List enumeration values for a simpleType. Pass the simpleType qname (e.g. 'w:ST_Jc' or 'ST_Jc') and get back the values in declaration order. ${QNAME_HELP}`,
		inputSchema: {
			type: "object" as const,
			properties: {
				qname: { type: "string", description: "simpleType qname." },
				profile: { type: "string", description: "Profile name (default: 'transitional')." },
			},
			required: ["qname"],
		},
	},
	{
		name: "ooxml_namespace",
		description:
			"Inspect or discover namespaces in the schema graph. Three modes: " +
			"(1) `uri` exact match → full report (vocabularies, per-profile symbol counts); " +
			"(2) `query` substring (case-insensitive, e.g. 'drawingml' or 'customXml') → list of matching namespaces; " +
			"(3) no args → list every ingested namespace. Note the schema-graph URI for a namespace can differ from the URI used in spec prose (e.g. custom XML data storage); the schema-graph URI is what this tool keys on.",
		inputSchema: {
			type: "object" as const,
			properties: {
				uri: { type: "string", description: "Exact namespace URI to look up." },
				query: {
					type: "string",
					description:
						"Case-insensitive substring to match against namespace URIs. Use when you don't have the exact URI.",
				},
			},
		},
	},
	{
		name: "ooxml_package_part",
		description:
			"Look up OPC (Open Packaging Conventions) part types: content type, source relationship type, root namespace and element, typical paths in the package. Answers 'what kind of part is /customXml/item1.xml?' — package metadata that the schema graph doesn't capture. Four modes: " +
			"(1) `content_type` exact match (e.g. 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'); " +
			"(2) `relationship_type` exact match (e.g. '.../officeDocument/2006/relationships/customXmlProps'); " +
			"(3) `query` case-insensitive substring across name, content type, relationship type, root namespace and element; " +
			"(4) no args → list every curated part. Curated from ECMA-376 Part 1 §11.3.x / §12.3.x / §13.3.x / §15.x; covers Word / Excel / PowerPoint plus cross-cutting (properties, theme, image, custom XML).",
		inputSchema: {
			type: "object" as const,
			properties: {
				content_type: {
					type: "string",
					description: "Exact OPC content type (Content_Types.xml value).",
				},
				relationship_type: {
					type: "string",
					description: "Exact source relationship type URI.",
				},
				query: {
					type: "string",
					description:
						"Case-insensitive substring across name, content type, relationship type, namespace, element, notes.",
				},
			},
		},
	},
];

export type OoxmlToolName =
	| "ooxml_element"
	| "ooxml_type"
	| "ooxml_children"
	| "ooxml_attributes"
	| "ooxml_enum"
	| "ooxml_namespace"
	| "ooxml_package_part";

const OOXML_TOOL_NAMES: ReadonlySet<string> = new Set(OOXML_TOOL_DEFS.map((t) => t.name));

export function isOoxmlTool(name: string): name is OoxmlToolName {
	return OOXML_TOOL_NAMES.has(name);
}

// biome-ignore lint/suspicious/noExplicitAny: neon's tagged template is loosely typed.
type Sql = any;

/**
 * Worker-side entry point: constructs a Neon HTTP client from env and dispatches.
 * Local CLIs and tests should call `runOoxmlTool` directly with their own sql
 * (e.g. postgres.js against a local Postgres) to avoid the Neon HTTP path.
 */
export async function callOoxmlTool(
	name: OoxmlToolName,
	args: Record<string, unknown>,
	env: OoxmlEnv,
): Promise<string> {
	const sql = neon(env.DATABASE_URL);
	return runOoxmlTool(name, args, sql);
}

/**
 * Driver-agnostic dispatch. `sql` is any tagged-template SQL function whose
 * shape matches `(strings, ...values) => Promise<row[]>` (Neon and postgres.js
 * both qualify).
 */
export async function runOoxmlTool(
	name: OoxmlToolName,
	args: Record<string, unknown>,
	sql: Sql,
): Promise<string> {
	const profile = (args.profile as string | undefined) ?? DEFAULT_PROFILE;

	switch (name) {
		case "ooxml_element": {
			const q = parseQName(String(args.qname ?? ""));
			if (!q.ok) return formatNotFound(`could not parse qname: ${q.reason}`);
			const hit = await lookupElement(sql, q.qname.namespace, q.qname.localName, profile);
			if (!hit) {
				const alts = await findLocalNameAcrossNamespaces(sql, q.qname.localName, profile, {
					kind: "element",
				});
				return formatNotFound(
					`element ${q.qname.localName} in namespace ${q.qname.namespace}`,
					profile,
					{ localName: q.qname.localName, alternatives: alts },
				);
			}
			return formatSymbolReport("Element", hit, profile);
		}

		case "ooxml_type": {
			const q = parseQName(String(args.qname ?? ""));
			if (!q.ok) return formatNotFound(`could not parse qname: ${q.reason}`);
			const hit = await lookupType(sql, q.qname.namespace, q.qname.localName, profile);
			if (!hit) {
				const alts = await findLocalNameAcrossNamespaces(sql, q.qname.localName, profile);
				return formatNotFound(
					`type ${q.qname.localName} in namespace ${q.qname.namespace}`,
					profile,
					{ localName: q.qname.localName, alternatives: alts },
				);
			}
			return formatSymbolReport(
				hit.kind === "simpleType" ? "SimpleType" : "ComplexType",
				hit,
				profile,
			);
		}

		case "ooxml_children": {
			const q = parseQName(String(args.qname ?? ""));
			if (!q.ok) return formatNotFound(`could not parse qname: ${q.reason}`);

			let typeSym = await lookupType(sql, q.qname.namespace, q.qname.localName, profile);
			let elementSym: SymbolHit | null = null;
			if (!typeSym) {
				elementSym = await lookupElement(sql, q.qname.namespace, q.qname.localName, profile);
				if (elementSym?.typeRef) {
					typeSym = await lookupSymbolByTypeRef(sql, elementSym.typeRef, profile);
				} else if (!elementSym) {
					// Fall back to looking for a named xsd:group with this qname (so
					// EG_PContent and friends are reachable directly).
					typeSym = await lookupSymbol(sql, q.qname.namespace, q.qname.localName, "group", profile);
				}
			}
			if (!typeSym) {
				const alts = await findLocalNameAcrossNamespaces(sql, q.qname.localName, profile);
				return formatNotFound(
					`children for ${q.qname.localName} in namespace ${q.qname.namespace}`,
					profile,
					{ localName: q.qname.localName, alternatives: alts },
				);
			}
			const children = await getChildren(sql, typeSym.id, profile);
			return formatChildrenReport(elementSym, typeSym, children, profile);
		}

		case "ooxml_attributes": {
			const q = parseQName(String(args.qname ?? ""));
			if (!q.ok) return formatNotFound(`could not parse qname: ${q.reason}`);
			let typeSym = await lookupType(sql, q.qname.namespace, q.qname.localName, profile);
			let elementSym: SymbolHit | null = null;
			if (!typeSym) {
				elementSym = await lookupElement(sql, q.qname.namespace, q.qname.localName, profile);
				if (elementSym?.typeRef) {
					typeSym = await lookupSymbolByTypeRef(sql, elementSym.typeRef, profile);
				}
			}
			if (!typeSym) {
				const alts = await findLocalNameAcrossNamespaces(sql, q.qname.localName, profile);
				return formatNotFound(
					`attributes for ${q.qname.localName} in namespace ${q.qname.namespace}`,
					profile,
					{ localName: q.qname.localName, alternatives: alts },
				);
			}
			const attrs = await getAttributes(sql, typeSym.id, profile);
			return formatAttributesReport(elementSym, typeSym, attrs, profile);
		}

		case "ooxml_enum": {
			const q = parseQName(String(args.qname ?? ""));
			if (!q.ok) return formatNotFound(`could not parse qname: ${q.reason}`);
			const sym = await lookupType(sql, q.qname.namespace, q.qname.localName, profile);
			if (!sym || sym.kind !== "simpleType") {
				const alts = await findLocalNameAcrossNamespaces(sql, q.qname.localName, profile, {
					kind: "simpleType",
				});
				return formatNotFound(
					`simpleType ${q.qname.localName} in namespace ${q.qname.namespace}`,
					profile,
					{ localName: q.qname.localName, alternatives: alts },
				);
			}
			const enums = await getEnums(sql, sym.id, profile);
			return formatEnumReport(sym, enums, profile);
		}

		case "ooxml_namespace": {
			const uri = typeof args.uri === "string" ? args.uri.trim() : "";
			const query = typeof args.query === "string" ? args.query.trim() : "";

			if (uri) {
				const info = await getNamespaceInfo(sql, uri);
				if (info) return formatNamespaceReport(info);

				// On exact miss, retry with the URI's last path segment as a
				// substring. This catches near-misses (trailing slash, version
				// drift) but is honest about its limits: spec-prose URIs that
				// don't share any literal substring with the XSD URI (e.g.
				// .../customXmlDataProps vs .../customXml) won't match here.
				// That bridge requires an explicit alias table, tracked
				// separately.
				const lastSegment = uri.replace(/\/+$/, "").split("/").pop() ?? "";
				const fallbackQuery = lastSegment.length >= 3 ? lastSegment : "";
				const matches = fallbackQuery ? await listNamespaces(sql, { query: fallbackQuery }) : [];
				return formatNamespaceList(matches, {
					title: `Namespace URI '${uri}' not found exactly`,
					note: matches.length
						? `Showing substring matches for '${fallbackQuery}'. No alias resolution between spec-prose URIs and XSD URIs is in place yet.`
						: "No near-matches by URI substring, and no alias resolution between spec-prose URIs and XSD URIs is in place yet. Try `ooxml_search` for prose references, or call `ooxml_namespace` with no args to list every ingested namespace.",
				});
			}

			const matches = await listNamespaces(sql, query ? { query } : {});
			return formatNamespaceList(matches, {
				title: query ? `Namespaces matching '${query}'` : "Ingested namespaces",
				note: matches.length
					? undefined
					: query
						? "No matches. Try `ooxml_search` for prose references or call this tool with no args to see every ingested namespace."
						: "No namespaces ingested. Run `bun run xsd:ingest`.",
			});
		}

		case "ooxml_package_part": {
			const contentType = typeof args.content_type === "string" ? args.content_type.trim() : "";
			const relationshipType =
				typeof args.relationship_type === "string" ? args.relationship_type.trim() : "";
			const query = typeof args.query === "string" ? args.query.trim() : "";

			if (contentType) {
				const hit = findPartByContentType(contentType);
				if (hit) return formatPackagePartReport(hit);
				return formatPackagePartNotFound("content type", contentType);
			}
			if (relationshipType) {
				const hits = findPartsByRelationshipType(relationshipType);
				if (hits.length === 1) return formatPackagePartReport(hits[0]);
				if (hits.length > 1) {
					// Shared rels (officeDocument across WML/SML/PML, customXml
					// across families) intentionally hit multiple parts.
					return formatPackagePartList(hits, {
						title: `Package parts using relationship '${relationshipType}'`,
						query: "",
						footer:
							"This relationship type is shared across package families. Disambiguate by the source part (the package's main part determines whether `.../relationships/officeDocument` points at a Word, Excel, or PowerPoint main part).",
					});
				}
				return formatPackagePartNotFound("relationship type", relationshipType);
			}
			const matches = searchParts(query);
			return formatPackagePartList(matches, {
				title: query ? `Package parts matching '${query}'` : "Curated OPC package parts",
				query,
			});
		}

		default: {
			const _exhaustive: never = name;
			throw new Error(`Unhandled OOXML tool: ${_exhaustive}`);
		}
	}
}

// --- Formatting --------------------------------------------------------

function formatSymbolReport(label: string, hit: SymbolHit, profile: string): string {
	const lines: string[] = [];
	lines.push(`## ${label}: ${hit.localName}`);
	lines.push("");
	lines.push(`- profile: ${profile}`);
	lines.push(
		`- canonical: (vocabulary=${hit.vocabularyId}, kind=${hit.kind}, name=${hit.localName})`,
	);
	lines.push(`- namespace: ${hit.namespaceUri}`);
	if (hit.typeRef) lines.push(`- type_ref: ${hit.typeRef}`);
	if (hit.sourceName) lines.push(`- source: ${hit.sourceName}`);
	return lines.join("\n");
}

function formatChildrenReport(
	element: SymbolHit | null,
	type: SymbolHit,
	children: ChildEdge[],
	profile: string,
): string {
	const lines: string[] = [];
	const heading = element
		? `Children of ${element.localName} (via type ${type.localName})`
		: `Children of ${type.localName}`;
	lines.push(`## ${heading}`);
	lines.push("");
	lines.push(`- profile: ${profile}`);
	lines.push(`- type vocabulary: ${type.vocabularyId}`);
	lines.push(`- type namespace: ${type.namespaceUri}`);
	if (type.sourceName) lines.push(`- source: ${type.sourceName}`);
	lines.push("");

	if (children.length === 0) {
		lines.push("_no direct or inherited children._");
		return lines.join("\n");
	}

	lines.push("| order | kind | name | min | max | compositor | from |");
	lines.push("| --- | --- | --- | --- | --- | --- | --- |");
	for (const c of children) {
		const max = c.maxOccurs === null ? "unbounded" : String(c.maxOccurs);
		const comp = c.compositorKind ?? "-";
		const from = c.source === "self" ? "self" : `inherited (${c.owningTypeName})`;
		lines.push(
			`| ${c.orderIndex} | ${c.kind} | ${c.localName} | ${c.minOccurs} | ${max} | ${comp} | ${from} |`,
		);
	}
	lines.push("");
	lines.push(
		"_group entries are returned as-is; call `ooxml_children` on the group qname to expand them._",
	);
	return lines.join("\n");
}

function formatAttributesReport(
	element: SymbolHit | null,
	type: SymbolHit,
	attrs: AttrEntry[],
	profile: string,
): string {
	const lines: string[] = [];
	const heading = element
		? `Attributes of ${element.localName} (via type ${type.localName})`
		: `Attributes of ${type.localName}`;
	lines.push(`## ${heading}`);
	lines.push("");
	lines.push(`- profile: ${profile}`);
	lines.push(`- type vocabulary: ${type.vocabularyId}`);
	if (type.sourceName) lines.push(`- source: ${type.sourceName}`);
	lines.push("");

	if (attrs.length === 0) {
		lines.push("_no attributes._");
		return lines.join("\n");
	}

	lines.push("| name | use | type | default | fixed | from |");
	lines.push("| --- | --- | --- | --- | --- | --- |");
	for (const a of attrs) {
		const from =
			a.source === "self"
				? "self"
				: a.source === "inherited"
					? `inherited (${a.owningName})`
					: `attributeGroup (${a.owningName})`;
		lines.push(
			`| ${a.localName} | ${a.attrUse} | ${a.typeRef ?? "-"} | ${a.defaultValue ?? "-"} | ${a.fixedValue ?? "-"} | ${from} |`,
		);
	}
	return lines.join("\n");
}

function formatEnumReport(sym: SymbolHit, enums: EnumEntry[], profile: string): string {
	const lines: string[] = [];
	lines.push(`## Enum values for ${sym.localName}`);
	lines.push("");
	lines.push(`- profile: ${profile}`);
	lines.push(`- vocabulary: ${sym.vocabularyId}`);
	lines.push(`- namespace: ${sym.namespaceUri}`);
	if (sym.sourceName) lines.push(`- source: ${sym.sourceName}`);
	lines.push("");
	if (enums.length === 0) {
		lines.push("_no enum values; this simpleType is constrained by base type or pattern only._");
	} else {
		for (const e of enums) lines.push(`- ${e.value}`);
	}
	return lines.join("\n");
}

function formatNamespaceReport(info: NamespaceInfo): string {
	const lines: string[] = [];
	lines.push(`## Namespace ${info.uri}`);
	lines.push("");
	lines.push(`- vocabularies: ${info.vocabularies.join(", ") || "(none)"}`);
	if (info.profiles.length === 0) {
		lines.push("- profiles: (no symbols in any profile)");
	} else {
		lines.push("- profiles:");
		for (const p of info.profiles) lines.push(`  - ${p.name}: ${p.symbolCount} symbols`);
	}
	return lines.join("\n");
}

function formatNamespaceList(
	matches: NamespaceInfo[],
	opts: { title: string; note?: string },
): string {
	const lines: string[] = [];
	lines.push(`## ${opts.title}`);
	lines.push("");
	if (matches.length === 0) {
		lines.push("_(no matches)_");
		if (opts.note) {
			lines.push("");
			lines.push(opts.note);
		}
		return lines.join("\n");
	}
	lines.push("| uri | vocabularies | profiles |");
	lines.push("| --- | --- | --- |");
	for (const m of matches) {
		const vocabs = m.vocabularies.join(", ") || "(none)";
		const profiles = m.profiles.map((p) => `${p.name} (${p.symbolCount})`).join(", ") || "(none)";
		lines.push(`| \`${m.uri}\` | ${vocabs} | ${profiles} |`);
	}
	if (opts.note) {
		lines.push("");
		lines.push(opts.note);
	}
	return lines.join("\n");
}

interface NotFoundExtras {
	localName?: string;
	alternatives?: LocalNameHit[];
}

function formatNotFound(what: string, profile?: string, extras?: NotFoundExtras): string {
	const lines: string[] = [];
	lines.push(`## Not found: ${what}`);
	if (profile) lines.push(`Searched in profile '${profile}'.`);
	lines.push("");

	const alts = extras?.alternatives ?? [];
	if (alts.length > 0 && extras?.localName) {
		// "alternatives" may include the same vocabulary with a different kind
		// (e.g. asking for type `w:document` when only element `w:document`
		// exists). All such hits are useful disambiguation context, so we
		// surface them under a neutral label rather than claiming they live in
		// "other vocabularies".
		lines.push(`Other top-level symbols named \`${extras.localName}\`:`);
		for (const a of alts) {
			lines.push(`- ${a.kind} \`${a.localName}\` in ${a.vocabularyId} (${a.namespaceUri})`);
		}
		lines.push("");
		lines.push("Disambiguate with a prefix, Clark-form namespace, or different kind.");
		lines.push("");
	}

	lines.push("Try one of:");
	lines.push(
		`- a known prefix qname (${knownPrefixes().slice(0, 10).join(", ")}, ...). Full list: pass an unknown prefix to see all.`,
	);
	lines.push("- Clark form `{namespace-uri}localName`");
	lines.push("- `ooxml_namespace` with no args (or a `query` substring) to discover namespaces");
	lines.push(
		"- `ooxml_search` / `ooxml_section` for elements documented in spec prose but not in the schema graph",
	);
	lines.push("- a different profile (currently only `transitional` is populated)");
	return lines.join("\n");
}

function formatPackagePartReport(p: OpcPart): string {
	const lines: string[] = [];
	lines.push(`## OPC Part: ${p.name}`);
	lines.push("");
	lines.push(`- key: \`${p.key}\``);
	const cts = contentTypesOf(p);
	if (cts.length === 1) {
		lines.push(`- content type: \`${cts[0]}\``);
	} else {
		lines.push(`- content types: ${cts.map((c) => `\`${c}\``).join(", ")}`);
	}
	lines.push(
		`- source relationship: ${p.relationshipType ? `\`${p.relationshipType}\`` : "_(implicit, none)_"}`,
	);
	lines.push(
		`- root namespace: ${p.rootNamespace ? `\`${p.rootNamespace}\`` : "_(none; binary or arbitrary-XML payload)_"}`,
	);
	lines.push(`- root element: ${p.rootElement ? `\`${p.rootElement}\`` : "_(none)_"}`);
	lines.push(`- typical paths: ${p.typicalPaths.map((t) => `\`${t}\``).join(", ")}`);
	lines.push(`- package families: ${p.packageFamilies.join(", ")}`);
	lines.push(`- spec: ${p.sourceSections.join("; ")}`);
	if (p.notes) {
		lines.push("");
		lines.push(`**Notes**: ${p.notes}`);
	}
	return lines.join("\n");
}

function formatPackagePartList(
	matches: readonly OpcPart[],
	opts: { title: string; query: string; footer?: string },
): string {
	const lines: string[] = [];
	lines.push(`## ${opts.title}`);
	lines.push("");
	if (matches.length === 0) {
		lines.push("_(no matches)_");
		lines.push("");
		lines.push(
			"Try `ooxml_package_part` with no args to see the full list, or `ooxml_search` for prose references.",
		);
		return lines.join("\n");
	}
	lines.push("| key | name | content type | families |");
	lines.push("| --- | --- | --- | --- |");
	for (const p of matches) {
		const cts = contentTypesOf(p);
		// Show first canonical type plus a "+N" indicator if there are more,
		// so the table stays compact for image/* and similar enumerated sets.
		const ctCell = cts.length === 1 ? `\`${cts[0]}\`` : `\`${cts[0]}\` _(+${cts.length - 1} more)_`;
		lines.push(`| \`${p.key}\` | ${p.name} | ${ctCell} | ${p.packageFamilies.join(", ")} |`);
	}
	lines.push("");
	lines.push(
		opts.footer ??
			"Pass an exact `content_type` or `relationship_type` for the full report on a single part.",
	);
	return lines.join("\n");
}

function formatPackagePartNotFound(
	kind: "content type" | "relationship type",
	value: string,
): string {
	const lines: string[] = [];
	lines.push(`## Not found: OPC part with ${kind} '${value}'`);
	lines.push("");
	lines.push("Try one of:");
	lines.push(
		"- `ooxml_package_part` with a `query` substring (e.g. 'styles', 'customXml', 'theme')",
	);
	lines.push("- `ooxml_package_part` with no args to list every curated part");
	lines.push(
		"- `ooxml_search` if the part type is documented in spec prose but not yet curated here",
	);
	return lines.join("\n");
}
