import {
	Client,
	StreamableHTTPClientTransport,
	UnauthorizedError,
} from "@modelcontextprotocol/client";
import { authorizeInBrowser } from "./browser-auth.js";
import { CLI_NAME, CLI_VERSION, MCP_URL } from "./constants.js";
import { CredentialStore } from "./credentials.js";
import { CliOAuthProvider } from "./oauth-provider.js";

interface ConnectOptions {
	allowBrowser: boolean;
	callbackPort: number;
}

export interface ConnectedMcpClient {
	client: Client;
	close(): Promise<void>;
}

function newClient(): Client {
	return new Client({ name: `${CLI_NAME}-cli`, version: CLI_VERSION }, { capabilities: {} });
}

function newTransport(serverUrl: URL, provider: CliOAuthProvider): StreamableHTTPClientTransport {
	return new StreamableHTTPClientTransport(serverUrl, { authProvider: provider });
}

export async function connectToMcp(options: ConnectOptions): Promise<ConnectedMcpClient> {
	const apiKey = process.env.OOXML_API_KEY;
	if (apiKey !== undefined) {
		if (!/^ooxml_app_[a-f0-9]{64}$/.test(apiKey))
			throw new Error("OOXML_API_KEY is not a valid application key");
		const client = newClient();
		const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
			requestInit: { headers: { Authorization: `Bearer ${apiKey}` }, redirect: "error" },
		});
		try {
			await client.connect(transport);
			return { client, close: () => client.close() };
		} catch {
			await client.close().catch(() => {});
			throw new Error(
				"OOXML application connection failed; check the key and service availability",
			);
		}
	}
	const redirectUrl = `http://127.0.0.1:${options.callbackPort}/callback`;
	const serverUrl = new URL(MCP_URL);
	const credentials = await new CredentialStore().open();
	try {
		const provider = new CliOAuthProvider(redirectUrl, credentials);
		await provider.load();

		let client = newClient();
		let transport = newTransport(serverUrl, provider);
		try {
			await client.connect(transport);
		} catch (error) {
			if (!(error instanceof UnauthorizedError)) throw error;
			if (!options.allowBrowser) {
				throw new Error("You are not signed in. Run `ooxml login` first.");
			}

			await authorizeInBrowser(provider, options.callbackPort, (params) =>
				transport.finishAuth(params),
			);
			client = newClient();
			transport = newTransport(serverUrl, provider);
			await client.connect(transport);
		}

		return {
			client,
			close: async () => {
				try {
					await client.close();
				} finally {
					await credentials.close();
				}
			},
		};
	} catch (error) {
		await credentials.close();
		throw error;
	}
}
