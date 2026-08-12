import { randomUUID } from "node:crypto";
import type {
	OAuthClientInformationContext,
	OAuthClientMetadata,
	OAuthClientProvider,
	OAuthDiscoveryState,
	StoredOAuthClientInformation,
	StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import { type CredentialSession, type StoredCredentials } from "./credentials.js";

export class CliOAuthProvider implements OAuthClientProvider {
	pendingAuthorizationUrl?: URL;
	private credentials: StoredCredentials = {};
	private expectedState?: string;

	readonly clientMetadata: OAuthClientMetadata;

	constructor(
		readonly redirectUrl: string,
		private readonly store: CredentialSession,
	) {
		this.clientMetadata = {
			client_name: "OOXML CLI",
			redirect_uris: [redirectUrl],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			application_type: "native",
			token_endpoint_auth_method: "none",
		};
	}

	async load(): Promise<void> {
		this.credentials = await this.store.read();
	}

	state(): string {
		this.expectedState ??= randomUUID();
		return this.expectedState;
	}

	validatesState(state: string | null): boolean {
		return Boolean(this.expectedState && state === this.expectedState);
	}

	clientInformation(
		_context?: OAuthClientInformationContext,
	): StoredOAuthClientInformation | undefined {
		return this.credentials.clientInformation;
	}

	async saveClientInformation(
		clientInformation: StoredOAuthClientInformation,
		_context?: OAuthClientInformationContext,
	): Promise<void> {
		this.credentials.clientInformation = clientInformation;
		await this.persist();
	}

	tokens(_context?: OAuthClientInformationContext): StoredOAuthTokens | undefined {
		return this.credentials.tokens;
	}

	async saveTokens(
		tokens: StoredOAuthTokens,
		_context?: OAuthClientInformationContext,
	): Promise<void> {
		this.credentials.tokens = tokens;
		delete this.credentials.verifier;
		await this.persist();
	}

	redirectToAuthorization(authorizationUrl: URL): void {
		this.pendingAuthorizationUrl = authorizationUrl;
	}

	async saveCodeVerifier(verifier: string): Promise<void> {
		this.credentials.verifier = verifier;
		await this.persist();
	}

	codeVerifier(): string {
		if (!this.credentials.verifier) throw new Error("Sign-in session data is missing");
		return this.credentials.verifier;
	}

	async saveDiscoveryState(discoveryState: OAuthDiscoveryState): Promise<void> {
		this.credentials.discoveryState = discoveryState;
		await this.persist();
	}

	discoveryState(): OAuthDiscoveryState | undefined {
		return this.credentials.discoveryState;
	}

	async invalidateCredentials(
		scope: "all" | "client" | "tokens" | "verifier" | "discovery",
	): Promise<void> {
		if (scope === "all" || scope === "client") delete this.credentials.clientInformation;
		if (scope === "all" || scope === "tokens") delete this.credentials.tokens;
		if (scope === "all" || scope === "verifier") delete this.credentials.verifier;
		if (scope === "all" || scope === "discovery") delete this.credentials.discoveryState;
		await this.persist();
	}

	private persist(): Promise<void> {
		return this.store.write(this.credentials);
	}
}
