import { docs } from "./docs";

export interface SeoMeta {
	title: string;
	description: string;
	type: "website" | "article";
}

const staticPages: Record<string, SeoMeta> = {
	"/": {
		title: "ooxml.dev — The OOXML spec, explained by people who actually implemented it",
		description:
			"ECMA-376 reference with live previews and implementation notes from building a real document engine. Built by the SuperDoc team.",
		type: "website",
	},
	"/mcp": {
		title: "ECMA-376 MCP Server — Search the OOXML Spec with AI | ooxml.dev",
		description:
			"Search OOXML spec prose, inspect XSD schemas, look up OPC package metadata, and query preset shapes from an MCP client.",
		type: "website",
	},
	"/cli": {
		title: "OOXML CLI — Search ECMA-376 from Your Terminal | ooxml.dev",
		description:
			"Search the ECMA-376 specification and inspect OOXML schemas from your terminal or a coding agent.",
		type: "website",
	},
	"/spec": {
		title: "ECMA-376 Spec Explorer — Search and Browse | ooxml.dev",
		description:
			"Semantic search across the full ECMA-376 Office Open XML specification. Find sections by meaning, not just keywords.",
		type: "website",
	},
	"/docs": {
		title: "OOXML Reference — Getting Started | ooxml.dev",
		description:
			"OOXML structure, namespaces, and how to use this reference. Live previews and implementation notes from building a real document engine.",
		type: "article",
	},
};

export function getSeoMeta(path: string): SeoMeta {
	if (staticPages[path]) {
		return staticPages[path];
	}

	const slug = path.replace("/docs/", "");
	const page = docs[slug];
	if (page) {
		const badge = page.badge ? ` (${page.badge})` : "";
		return {
			title: `${page.title}${badge} — OOXML Reference | ooxml.dev`,
			description:
				page.description || `${page.title} — interactive OOXML reference with live previews.`,
			type: "article",
		};
	}

	return staticPages["/"];
}

export function getAllPaths(): string[] {
	const paths = ["/", "/cli", "/mcp", "/spec", "/docs"];
	for (const slug of Object.keys(docs)) {
		if (slug === "index") continue;
		paths.push(`/docs/${slug}`);
	}
	return paths;
}
