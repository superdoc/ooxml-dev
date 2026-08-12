#!/usr/bin/env node

import type { ContentBlock } from "@modelcontextprotocol/client";
import { parseArguments } from "./arguments.js";
import { callbackPort, CLI_VERSION } from "./constants.js";
import { CredentialStore } from "./credentials.js";
import { connectToMcp } from "./mcp-client.js";

const HELP = `Search and inspect the OOXML reference.

Usage:
  ooxml login
  ooxml search <query> [--part <1-4>] [--limit <1-20>]
  ooxml section <section-id> [--part <1-4>]
  ooxml parts [--part <1-4>]
  ooxml element <qname> [--profile <profile>]
  ooxml type <qname> [--profile <profile>]
  ooxml children <qname> [--profile <profile>]
  ooxml attributes <qname> [--profile <profile>]
  ooxml enum <qname> [--profile <profile>]
  ooxml namespace [query] [--uri <exact-uri>]
  ooxml package-part [query] [--content-type <type> | --relationship-type <uri>]
  ooxml preset-shape <shape>
  ooxml logout

Example:
  ooxml element w:p`;

async function withClient<T>(
	allowBrowser: boolean,
	callback: (client: Awaited<ReturnType<typeof connectToMcp>>["client"]) => Promise<T>,
): Promise<T> {
	const connection = await connectToMcp({
		allowBrowser,
		callbackPort: callbackPort(),
	});
	try {
		return await callback(connection.client);
	} finally {
		await connection.close();
	}
}

function printContent(content: ContentBlock[]): void {
	for (const item of content) {
		if (item.type === "text") console.log(item.text);
		else console.log(JSON.stringify(item));
	}
}

async function main(): Promise<void> {
	const command = parseArguments(process.argv.slice(2));
	if (command.name === "help") {
		console.log(HELP);
		return;
	}
	if (command.name === "version") {
		console.log(CLI_VERSION);
		return;
	}
	if (command.name === "logout") {
		const credentials = await new CredentialStore().open();
		try {
			await credentials.clear();
			console.log("Signed out on this device.");
		} finally {
			await credentials.close();
		}
		return;
	}
	if (command.name === "login") {
		await withClient(true, async () => {});
		console.log("Signed in to ooxml.dev.");
		return;
	}
	await withClient(false, async (client) => {
		const result = await client.callTool({ name: command.tool, arguments: command.input });
		printContent(result.content);
		if (result.isError) process.exitCode = 1;
	});
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
