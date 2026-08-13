import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
	OAuthDiscoveryState,
	StoredOAuthClientInformation,
	StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import { lock as lockFile } from "proper-lockfile";

export interface StoredCredentials {
	clientInformation?: StoredOAuthClientInformation;
	discoveryState?: OAuthDiscoveryState;
	tokens?: StoredOAuthTokens;
	verifier?: string;
}

function defaultConfigDirectory(): string {
	if (process.platform === "win32") {
		return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "ooxml");
	}
	if (process.platform === "darwin") {
		return join(homedir(), "Library", "Application Support", "ooxml");
	}
	return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "ooxml");
}

export function credentialsPath(): string {
	return join(process.env.OOXML_CONFIG_DIR ?? defaultConfigDirectory(), "credentials.json");
}

export class CredentialStore {
	constructor(readonly path = credentialsPath()) {}

	async open(): Promise<CredentialSession> {
		const directory = dirname(this.path);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		if (process.platform !== "win32") await chmod(directory, 0o700);
		try {
			const release = await lockFile(this.path, {
				realpath: false,
				retries: { retries: 20, factor: 1.25, minTimeout: 50, maxTimeout: 500, randomize: true },
			});
			return new CredentialSession(this.path, release);
		} catch (error) {
			throw new Error("Another OOXML command is running. Wait for it to finish, then try again.", {
				cause: error,
			});
		}
	}
}

export class CredentialSession {
	constructor(
		readonly path: string,
		private readonly release: () => Promise<void>,
	) {}

	async read(): Promise<StoredCredentials> {
		try {
			return JSON.parse(await readFile(this.path, "utf8")) as StoredCredentials;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
			throw new Error(`Could not read CLI credentials at ${this.path}`, { cause: error });
		}
	}

	async write(credentials: StoredCredentials): Promise<void> {
		const temporaryPath = `${this.path}.${process.pid}.tmp`;
		await writeFile(temporaryPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
		if (process.platform !== "win32") await chmod(temporaryPath, 0o600);
		await rename(temporaryPath, this.path);
	}

	async clear(): Promise<void> {
		await rm(this.path, { force: true });
	}

	close(): Promise<void> {
		return this.release();
	}
}
