import { useClerk } from "@clerk/react";
import { buildAccountsBaseUrl } from "@clerk/shared/buildAccountsBaseUrl";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

interface FinalizeNavigationParams {
	decorateUrl: (url: string) => string;
}

type UrlDecorator = (url: string) => string;

const keepUrl = (url: string) => url;
const DEFAULT_MCP_API_URL = "https://api.ooxml.dev";

function isMcpAuthorizationRedirect(destination: URL, mcpApiUrl: string): boolean {
	return destination.origin === new URL(mcpApiUrl).origin && destination.pathname === "/authorize";
}

export function safeRequestedRedirect(
	frontendApi: string,
	requested: string | null,
	currentOrigin: string,
	mcpApiUrl = DEFAULT_MCP_API_URL,
): string {
	if (!requested) return "/";

	try {
		const destination = new URL(requested, currentOrigin);
		const clerkOrigin = new URL(
			frontendApi.includes("://") ? frontendApi : `https://${frontendApi}`,
		).origin;
		const accountsOrigin = new URL(buildAccountsBaseUrl(frontendApi)).origin;

		// Clerk owns sign-in, while the API owns MCP authorization and consent.
		if (
			destination.origin !== currentOrigin &&
			destination.origin !== clerkOrigin &&
			destination.origin !== accountsOrigin &&
			!isMcpAuthorizationRedirect(destination, mcpApiUrl)
		) {
			return "/";
		}

		if (destination.origin !== currentOrigin) return destination.toString();

		// A path beginning with `//` is reinterpreted as a different host when it is
		// later passed back to URL. Keep same-origin redirects as local paths.
		const pathname = destination.pathname.replace(/^\/+/, "/");
		return `${pathname}${destination.search}${destination.hash}`;
	} catch {
		return "/";
	}
}

function useRequestedRedirectNavigation() {
	const clerk = useClerk();
	const navigate = useNavigate();

	return useCallback(
		(decorateUrl: UrlDecorator) => {
			const requested = safeRequestedRedirect(
				clerk.frontendApi,
				new URLSearchParams(window.location.search).get("redirect_url"),
				window.location.origin,
				import.meta.env.VITE_API_URL ?? DEFAULT_MCP_API_URL,
			);
			const decorated = decorateUrl(requested);
			const destination = new URL(decorated, window.location.origin);

			if (destination.origin !== window.location.origin) {
				window.location.assign(destination.toString());
				return;
			}

			return navigate(`${destination.pathname}${destination.search}${destination.hash}`, {
				replace: true,
			});
		},
		[clerk.frontendApi, navigate],
	);
}

export function useAuthContinueNavigation() {
	const navigateToRequestedRedirect = useRequestedRedirectNavigation();

	return useCallback(() => navigateToRequestedRedirect(keepUrl), [navigateToRequestedRedirect]);
}

export function useAuthFinalizeNavigation() {
	const navigateToRequestedRedirect = useRequestedRedirectNavigation();

	return useCallback(
		({ decorateUrl }: FinalizeNavigationParams) => navigateToRequestedRedirect(decorateUrl),
		[navigateToRequestedRedirect],
	);
}
