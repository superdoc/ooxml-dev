export const CLI_NAME = "ooxml";
export const CLI_VERSION = "0.1.0";
export const DEFAULT_MCP_URL = "https://api.ooxml.dev/mcp";
export const DEFAULT_CALLBACK_PORT = 53_682;

export function mcpUrl(): URL {
	return new URL(process.env.OOXML_MCP_URL ?? DEFAULT_MCP_URL);
}

export function callbackPort(): number {
	const rawPort = process.env.OOXML_CALLBACK_PORT;
	if (!rawPort) return DEFAULT_CALLBACK_PORT;

	const port = Number(rawPort);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error("OOXML_CALLBACK_PORT must be an integer between 1 and 65535");
	}
	return port;
}
