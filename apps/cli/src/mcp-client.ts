import {
	Client,
	StreamableHTTPClientTransport,
	UnauthorizedError,
} from "@modelcontextprotocol/client";
import { authorizeInBrowser } from "./browser-auth.js";
import { CLI_NAME, CLI_VERSION } from "./constants.js";
import { CredentialStore } from "./credentials.js";
import { CliOAuthProvider } from "./oauth-provider.js";

interface ConnectOptions {
	allowBrowser: boolean;
	callbackPort: number;
	serverUrl: URL;
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
	const redirectUrl = `http://127.0.0.1:${options.callbackPort}/callback`;
	const provider = new CliOAuthProvider(redirectUrl, new CredentialStore());
	await provider.load();

	let client = newClient();
	let transport = newTransport(options.serverUrl, provider);
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
		transport = newTransport(options.serverUrl, provider);
		await client.connect(transport);
	}

	return {
		client,
		close: () => client.close(),
	};
}
