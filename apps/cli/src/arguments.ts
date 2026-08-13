export type OoxmlCommand =
	| { name: "help" }
	| { name: "version" }
	| { name: "login" }
	| { name: "logout" }
	| { name: "query"; tool: string; input: Record<string, unknown> };

interface ParsedOptions {
	positionals: string[];
	values: Map<string, string>;
}

function parseOptions(args: string[], allowed: string[]): ParsedOptions {
	const positionals: string[] = [];
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (!argument.startsWith("--")) {
			positionals.push(argument);
			continue;
		}
		if (!allowed.includes(argument)) throw new Error(`Unknown option: ${argument}`);
		const value = args[index + 1];
		if (!value || value.startsWith("--")) throw new Error(`${argument} needs a value`);
		values.set(argument, value);
		index += 1;
	}
	return { positionals, values };
}

function singleValue(args: string[], usage: string, options: string[] = []): ParsedOptions {
	const parsed = parseOptions(args, options);
	if (parsed.positionals.length !== 1) throw new Error(`Usage: ${usage}`);
	return parsed;
}

function optionalNumber(
	value: string | undefined,
	option: string,
	minimum: number,
	maximum: number,
) {
	if (value === undefined) return undefined;
	const number = Number(value);
	if (!Number.isInteger(number) || number < minimum || number > maximum) {
		throw new Error(`${option} must be an integer between ${minimum} and ${maximum}`);
	}
	return number;
}

function withProfile(qname: string, profile: string | undefined): Record<string, unknown> {
	return profile ? { qname, profile } : { qname };
}

export function parseArguments(args: string[]): OoxmlCommand {
	const [command, ...rest] = args;
	if (!command || command === "help" || command === "--help" || command === "-h") {
		return { name: "help" };
	}
	if (command === "--version" || command === "-v" || command === "version") {
		if (rest.length) throw new Error("The version command does not accept arguments");
		return { name: "version" };
	}
	if (command === "login" || command === "logout") {
		if (rest.length) throw new Error(`The ${command} command does not accept arguments`);
		return { name: command };
	}

	if (command === "search") {
		const parsed = singleValue(rest, "ooxml search <query> [--part <1-4>] [--limit <1-20>]", [
			"--part",
			"--limit",
		]);
		const part = optionalNumber(parsed.values.get("--part"), "--part", 1, 4);
		const limit = optionalNumber(parsed.values.get("--limit"), "--limit", 1, 20);
		return {
			name: "query",
			tool: "ooxml_search",
			input: { query: parsed.positionals[0], ...(part && { part }), ...(limit && { limit }) },
		};
	}

	if (command === "section") {
		const parsed = singleValue(rest, "ooxml section <section-id> [--part <1-4>]", ["--part"]);
		const part = optionalNumber(parsed.values.get("--part"), "--part", 1, 4);
		return {
			name: "query",
			tool: "ooxml_section",
			input: { section_id: parsed.positionals[0], ...(part && { part }) },
		};
	}

	if (command === "parts") {
		const parsed = parseOptions(rest, ["--part"]);
		if (parsed.positionals.length) throw new Error("Usage: ooxml parts [--part <1-4>]");
		const part = optionalNumber(parsed.values.get("--part"), "--part", 1, 4);
		return { name: "query", tool: "ooxml_parts", input: part ? { part } : {} };
	}

	const qnameTools: Record<string, string> = {
		element: "ooxml_element",
		type: "ooxml_type",
		children: "ooxml_children",
		attributes: "ooxml_attributes",
		enum: "ooxml_enum",
	};
	if (Object.hasOwn(qnameTools, command)) {
		const parsed = singleValue(rest, `ooxml ${command} <qname> [--profile <profile>]`, [
			"--profile",
		]);
		return {
			name: "query",
			tool: qnameTools[command],
			input: withProfile(parsed.positionals[0], parsed.values.get("--profile")),
		};
	}

	if (command === "namespace") {
		const parsed = parseOptions(rest, ["--uri"]);
		if (
			parsed.positionals.length > 1 ||
			(parsed.positionals.length && parsed.values.has("--uri"))
		) {
			throw new Error("Usage: ooxml namespace [query] [--uri <exact-uri>]");
		}
		return {
			name: "query",
			tool: "ooxml_namespace",
			input: parsed.values.has("--uri")
				? { uri: parsed.values.get("--uri") }
				: parsed.positionals.length
					? { query: parsed.positionals[0] }
					: {},
		};
	}

	if (command === "package-part") {
		const parsed = parseOptions(rest, ["--content-type", "--relationship-type"]);
		const modes = [
			parsed.positionals.length ? "query" : undefined,
			parsed.values.has("--content-type") ? "content_type" : undefined,
			parsed.values.has("--relationship-type") ? "relationship_type" : undefined,
		].filter(Boolean);
		if (parsed.positionals.length > 1 || modes.length > 1) {
			throw new Error(
				"Usage: ooxml package-part [query] [--content-type <type> | --relationship-type <uri>]",
			);
		}
		const input = parsed.positionals.length
			? { query: parsed.positionals[0] }
			: parsed.values.has("--content-type")
				? { content_type: parsed.values.get("--content-type") }
				: parsed.values.has("--relationship-type")
					? { relationship_type: parsed.values.get("--relationship-type") }
					: {};
		return { name: "query", tool: "ooxml_package_part", input };
	}

	if (command === "preset-shape") {
		const parsed = singleValue(rest, "ooxml preset-shape <shape>");
		return {
			name: "query",
			tool: "ooxml_preset_shape",
			input: { shape: parsed.positionals[0] },
		};
	}

	throw new Error(`Unknown command: ${command}`);
}
