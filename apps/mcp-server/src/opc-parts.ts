/**
 * Curated reference for OPC (Open Packaging Conventions) package parts.
 *
 * The schema graph (`xsd_*`) answers "what elements are legal inside this XML
 * body?" The prose corpus (`spec_content`) answers "what does this section
 * say?" Neither answers "what kind of OPC part is `/customXml/item1.xml`?"
 * That is package metadata: content type, source relationship type, root
 * namespace, typical path - all defined in ECMA-376 Part 1 §15.x and the
 * vocabulary-specific Parts (§11.3.x WML, §12.3.x SML, §13.3.x PML).
 *
 * Static typed data here, no DB. The set is small (~25 records), static
 * across ECMA editions, and curated; PR diff is the right audit primitive.
 * Add a new entry by appending to OPC_PARTS - the lookup index is rebuilt
 * lazily from the literal array on first access.
 *
 * Where the spec prose and the XSD targetNamespace disagree (custom XML
 * data storage properties), this file pins `rootNamespace` to the XSD URI
 * so the value resolves through the schema-graph tools too.
 */

export type PackageFamily = "wordprocessing" | "spreadsheet" | "presentation";

export interface OpcPart {
	/** Human-readable name as it appears in the spec heading. */
	name: string;
	/** Stable, machine-readable id (kebab-case). Stable across spec edits. */
	key: string;
	/**
	 * OPC content type(s) (Content_Types.xml `Override` or `Default` value).
	 * Most parts have a single canonical value; binary parts that accept any
	 * media type in a family (image, embedded font) carry the enumerated set
	 * called out in the spec so exact lookups against [Content_Types].xml
	 * resolve. Display uses the first entry; lookups index every entry.
	 */
	contentType: string | string[];
	/**
	 * Source relationship type URI. `null` when the part is referenced only
	 * by an implicit relationship from the package (e.g. core properties).
	 */
	relationshipType: string | null;
	/**
	 * Target namespace of the XML root, or `null` for binary / arbitrary-XML
	 * parts (image data, custom XML data storage body).
	 */
	rootNamespace: string | null;
	/**
	 * Local name of the XML root element, or `null` when the part has no
	 * fixed root (image data, arbitrary-XML payload).
	 */
	rootElement: string | null;
	/** Typical part-name paths inside the package (informative; varies). */
	typicalPaths: string[];
	/** Source sections in ECMA-376 Part 1. */
	sourceSections: string[];
	/** Implementation notes; spec divergences, common gotchas. */
	notes?: string;
	/** Which document families use this part type. */
	packageFamilies: PackageFamily[];
}

export const OPC_PARTS: readonly OpcPart[] = [
	// --- WordprocessingML ----------------------------------------------------
	{
		name: "Main Document Part",
		key: "wml-document",
		contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
		rootNamespace: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
		rootElement: "document",
		typicalPaths: ["word/document.xml"],
		sourceSections: ["Part 1, §11.3.10"],
		packageFamilies: ["wordprocessing"],
	},
	{
		name: "Style Definitions Part",
		key: "wml-styles",
		contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
		relationshipType: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
		rootNamespace: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
		rootElement: "styles",
		typicalPaths: ["word/styles.xml"],
		sourceSections: ["Part 1, §11.3.12"],
		packageFamilies: ["wordprocessing"],
	},
	{
		name: "Settings Part",
		key: "wml-settings",
		contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings",
		rootNamespace: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
		rootElement: "settings",
		typicalPaths: ["word/settings.xml"],
		sourceSections: ["Part 1, §11.3.3"],
		packageFamilies: ["wordprocessing"],
	},
	{
		name: "Numbering Definitions Part",
		key: "wml-numbering",
		contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
		rootNamespace: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
		rootElement: "numbering",
		typicalPaths: ["word/numbering.xml"],
		sourceSections: ["Part 1, §11.3.11"],
		packageFamilies: ["wordprocessing"],
	},
	{
		name: "Comments Part",
		key: "wml-comments",
		contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
		rootNamespace: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
		rootElement: "comments",
		typicalPaths: ["word/comments.xml"],
		sourceSections: ["Part 1, §11.3.2"],
		packageFamilies: ["wordprocessing"],
	},
	{
		name: "Footnotes Part",
		key: "wml-footnotes",
		contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes",
		rootNamespace: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
		rootElement: "footnotes",
		typicalPaths: ["word/footnotes.xml"],
		sourceSections: ["Part 1, §11.3.7"],
		packageFamilies: ["wordprocessing"],
	},
	{
		name: "Endnotes Part",
		key: "wml-endnotes",
		contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes",
		rootNamespace: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
		rootElement: "endnotes",
		typicalPaths: ["word/endnotes.xml"],
		sourceSections: ["Part 1, §11.3.5"],
		packageFamilies: ["wordprocessing"],
	},
	{
		name: "Header Part",
		key: "wml-header",
		contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
		relationshipType: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
		rootNamespace: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
		rootElement: "hdr",
		typicalPaths: ["word/header1.xml", "word/header2.xml"],
		sourceSections: ["Part 1, §11.3.9"],
		notes:
			"A package can contain multiple header parts; each is referenced from sectPr in the main document.",
		packageFamilies: ["wordprocessing"],
	},
	{
		name: "Footer Part",
		key: "wml-footer",
		contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
		relationshipType: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
		rootNamespace: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
		rootElement: "ftr",
		typicalPaths: ["word/footer1.xml", "word/footer2.xml"],
		sourceSections: ["Part 1, §11.3.6"],
		notes:
			"A package can contain multiple footer parts; each is referenced from sectPr in the main document.",
		packageFamilies: ["wordprocessing"],
	},

	// --- SpreadsheetML -------------------------------------------------------
	{
		name: "Workbook Part",
		key: "sml-workbook",
		contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
		rootNamespace: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
		rootElement: "workbook",
		typicalPaths: ["xl/workbook.xml"],
		sourceSections: ["Part 1, §12.3.23"],
		packageFamilies: ["spreadsheet"],
	},
	{
		name: "Worksheet Part",
		key: "sml-worksheet",
		contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
		rootNamespace: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
		rootElement: "worksheet",
		typicalPaths: ["xl/worksheets/sheet1.xml"],
		sourceSections: ["Part 1, §12.3.24"],
		packageFamilies: ["spreadsheet"],
	},
	{
		name: "Shared String Table Part",
		key: "sml-shared-strings",
		contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings",
		rootNamespace: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
		rootElement: "sst",
		typicalPaths: ["xl/sharedStrings.xml"],
		sourceSections: ["Part 1, §12.3.15"],
		packageFamilies: ["spreadsheet"],
	},

	// --- PresentationML -----------------------------------------------------
	{
		name: "Presentation Part",
		key: "pml-presentation",
		contentType:
			"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
		rootNamespace: "http://schemas.openxmlformats.org/presentationml/2006/main",
		rootElement: "presentation",
		typicalPaths: ["ppt/presentation.xml"],
		sourceSections: ["Part 1, §13.3.6"],
		packageFamilies: ["presentation"],
	},
	{
		name: "Slide Part",
		key: "pml-slide",
		contentType: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
		relationshipType: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
		rootNamespace: "http://schemas.openxmlformats.org/presentationml/2006/main",
		rootElement: "sld",
		typicalPaths: ["ppt/slides/slide1.xml"],
		sourceSections: ["Part 1, §13.3.8"],
		packageFamilies: ["presentation"],
	},
	{
		name: "Slide Layout Part",
		key: "pml-slide-layout",
		contentType: "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout",
		rootNamespace: "http://schemas.openxmlformats.org/presentationml/2006/main",
		rootElement: "sldLayout",
		typicalPaths: ["ppt/slideLayouts/slideLayout1.xml"],
		sourceSections: ["Part 1, §13.3.9"],
		packageFamilies: ["presentation"],
	},
	{
		name: "Slide Master Part",
		key: "pml-slide-master",
		contentType: "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster",
		rootNamespace: "http://schemas.openxmlformats.org/presentationml/2006/main",
		rootElement: "sldMaster",
		typicalPaths: ["ppt/slideMasters/slideMaster1.xml"],
		sourceSections: ["Part 1, §13.3.10"],
		packageFamilies: ["presentation"],
	},

	// --- Cross-cutting ------------------------------------------------------
	{
		name: "Core File Properties Part",
		key: "core-properties",
		contentType: "application/vnd.openxmlformats-package.core-properties+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
		rootNamespace: "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
		rootElement: "coreProperties",
		typicalPaths: ["docProps/core.xml"],
		sourceSections: ["Part 1, §15.2.12.1"],
		notes:
			"Targeted by an implicit relationship from the package root, not from the main document.",
		packageFamilies: ["wordprocessing", "spreadsheet", "presentation"],
	},
	{
		name: "Extended File Properties Part",
		key: "extended-properties",
		contentType: "application/vnd.openxmlformats-officedocument.extended-properties+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties",
		rootNamespace: "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
		rootElement: "Properties",
		typicalPaths: ["docProps/app.xml"],
		sourceSections: ["Part 1, §15.2.12.3"],
		packageFamilies: ["wordprocessing", "spreadsheet", "presentation"],
	},
	{
		name: "Custom File Properties Part",
		key: "custom-properties",
		contentType: "application/vnd.openxmlformats-officedocument.custom-properties+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties",
		rootNamespace: "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties",
		rootElement: "Properties",
		typicalPaths: ["docProps/custom.xml"],
		sourceSections: ["Part 1, §15.2.12.2"],
		packageFamilies: ["wordprocessing", "spreadsheet", "presentation"],
	},
	{
		name: "Theme Part",
		key: "theme",
		contentType: "application/vnd.openxmlformats-officedocument.theme+xml",
		relationshipType: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
		rootNamespace: "http://schemas.openxmlformats.org/drawingml/2006/main",
		rootElement: "theme",
		typicalPaths: ["word/theme/theme1.xml", "xl/theme/theme1.xml", "ppt/theme/theme1.xml"],
		sourceSections: ["Part 1, §14.2.7.10"],
		packageFamilies: ["wordprocessing", "spreadsheet", "presentation"],
	},
	{
		name: "Image Part",
		key: "image",
		// Enumerated set called out in Part 1 §15.2.13. Real [Content_Types].xml
		// entries use a specific media type per image, not a wildcard; agents
		// looking up image/png must resolve to this record.
		contentType: [
			"image/png",
			"image/jpeg",
			"image/gif",
			"image/tiff",
			"image/x-emf",
			"image/x-wmf",
			"image/bmp",
		],
		relationshipType: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
		rootNamespace: null,
		rootElement: null,
		typicalPaths: ["word/media/image1.png", "xl/media/image1.png", "ppt/media/image1.png"],
		sourceSections: ["Part 1, §15.2.13"],
		notes:
			"Binary part; the content type recorded in [Content_Types].xml is the specific image media type. Each image becomes its own part. Other image/* media types may appear in practice; only the spec-enumerated set is indexed here.",
		packageFamilies: ["wordprocessing", "spreadsheet", "presentation"],
	},
	{
		name: "Custom XML Data Storage Part",
		key: "custom-xml-data",
		contentType: "application/xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml",
		rootNamespace: null,
		rootElement: null,
		typicalPaths: ["customXml/item1.xml", "customXml/item2.xml"],
		sourceSections: ["Part 1, §15.2.5"],
		notes:
			"Arbitrary XML payload; root namespace and element are whatever the consumer puts there. Each storage part has a sibling Custom XML Data Storage Properties Part that identifies it.",
		packageFamilies: ["wordprocessing", "spreadsheet", "presentation"],
	},
	{
		name: "Custom XML Data Storage Properties Part",
		key: "custom-xml-data-properties",
		contentType: "application/vnd.openxmlformats-officedocument.customXmlProperties+xml",
		relationshipType:
			"http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps",
		rootNamespace: "http://schemas.openxmlformats.org/officeDocument/2006/customXml",
		rootElement: "datastoreItem",
		typicalPaths: ["customXml/itemProps1.xml", "customXml/itemProps2.xml"],
		sourceSections: ["Part 1, §15.2.6", "Part 1, §22.5.2.1"],
		notes:
			"Spec/XSD divergence: ECMA-376 Part 1 §15.2.6 names the root namespace as `.../officeDocument/customXmlDataProps`, but the shipped XSD targets `.../officeDocument/2006/customXml`. The schema-graph URI (used here) is what real packages use and what `ooxml_element` keys on.",
		packageFamilies: ["wordprocessing", "spreadsheet", "presentation"],
	},
];

// --- Lookup helpers --------------------------------------------------------

/** Normalize contentType (string | string[]) to a stable array view. */
export function contentTypesOf(p: OpcPart): readonly string[] {
	return Array.isArray(p.contentType) ? p.contentType : [p.contentType];
}

let byContentType: Map<string, OpcPart> | null = null;
let byRelationshipType: Map<string, OpcPart[]> | null = null;

function indexes(): {
	byContentType: Map<string, OpcPart>;
	byRelationshipType: Map<string, OpcPart[]>;
} {
	if (!byContentType || !byRelationshipType) {
		byContentType = new Map();
		byRelationshipType = new Map();
		for (const p of OPC_PARTS) {
			// Content type is unique per record by construction (binary parts
			// enumerate their accepted media types; XML parts have one each).
			// Index every alias.
			for (const ct of contentTypesOf(p)) byContentType.set(ct, p);
			// Relationship type is intentionally non-unique: the .../relationships/
			// officeDocument rel points at the main part for WML / SML / PML,
			// the .../relationships/customXml rel can target any custom XML
			// storage part regardless of family. Group hits per URI so the
			// caller can disambiguate.
			if (p.relationshipType) {
				const bucket = byRelationshipType.get(p.relationshipType);
				if (bucket) bucket.push(p);
				else byRelationshipType.set(p.relationshipType, [p]);
			}
		}
	}
	return { byContentType, byRelationshipType };
}

/** Exact-match lookup by OPC content type. */
export function findPartByContentType(contentType: string): OpcPart | null {
	return indexes().byContentType.get(contentType) ?? null;
}

/**
 * Lookup by source relationship type URI. Returns every part that uses
 * the URI: the `.../relationships/officeDocument` rel, for example,
 * points at three different main parts (Word / Excel / PowerPoint), and
 * the caller has to disambiguate by package family. Returns an empty
 * array on miss.
 */
export function findPartsByRelationshipType(relationshipType: string): readonly OpcPart[] {
	return indexes().byRelationshipType.get(relationshipType) ?? [];
}

/**
 * Case-insensitive substring search over name, key, content type(s),
 * relationship type, root namespace, root element, and notes. Returns
 * matches in their declared order in OPC_PARTS (which groups by family).
 */
export function searchParts(query: string): OpcPart[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...OPC_PARTS];
	const hits: OpcPart[] = [];
	for (const p of OPC_PARTS) {
		const haystack = [
			p.name,
			p.key,
			...contentTypesOf(p),
			p.relationshipType ?? "",
			p.rootNamespace ?? "",
			p.rootElement ?? "",
			p.notes ?? "",
		]
			.join(" ")
			.toLowerCase();
		if (haystack.includes(q)) hits.push(p);
	}
	return hits;
}
