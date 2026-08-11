import { MCP_V2_PROTOCOL_VERSION, MCP_V2_TOOL_NAME } from "../apps/mcp-server/src/mcp-v2";

const token = process.env.OOXML_MCP_TOKEN;
const url = process.env.OOXML_MCP_URL ?? "http://localhost:8787/mcp-v2";

if (!token) {
	console.error("Set OOXML_MCP_TOKEN to a Clerk bearer token before running this probe.");
	process.exit(1);
}

const response = await fetch(url, {
	method: "POST",
	headers: {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
		"MCP-Protocol-Version": MCP_V2_PROTOCOL_VERSION,
		"Mcp-Method": "tools/call",
		"Mcp-Name": MCP_V2_TOOL_NAME,
	},
	body: JSON.stringify({
		jsonrpc: "2.0",
		id: 1,
		method: "tools/call",
		params: {
			name: MCP_V2_TOOL_NAME,
			arguments: {},
			_meta: {
				"io.modelcontextprotocol/protocolVersion": MCP_V2_PROTOCOL_VERSION,
				"io.modelcontextprotocol/clientInfo": {
					name: "ooxml-mcp-v2-probe",
					version: "0.1.0",
				},
				"io.modelcontextprotocol/clientCapabilities": {},
			},
		},
	}),
});

console.log(`HTTP ${response.status}`);
console.log(await response.text());

if (!response.ok) process.exit(1);
