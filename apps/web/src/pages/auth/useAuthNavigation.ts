import { useClerk } from "@clerk/react";
import { buildAccountsBaseUrl } from "@clerk/shared/buildAccountsBaseUrl";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

interface FinalizeNavigationParams {
	decorateUrl: (url: string) => string;
}

type UrlDecorator = (url: string) => string;

const keepUrl = (url: string) => url;

export function safeRequestedRedirect(
	frontendApi: string,
	requested: string | null,
	currentOrigin: string,
): string {
	if (!requested) return "/";

	try {
		const destination = new URL(requested, currentOrigin);
		const clerkOrigin = new URL(
			frontendApi.includes("://") ? frontendApi : `https://${frontendApi}`,
		).origin;
		const accountsOrigin = new URL(buildAccountsBaseUrl(frontendApi)).origin;

		// OAuth can return through Clerk's API or Account Portal. Reject every other external URL.
		if (
			destination.origin !== currentOrigin &&
			destination.origin !== clerkOrigin &&
			destination.origin !== accountsOrigin
		) {
			return "/";
		}

		return destination.origin === currentOrigin
			? `${destination.pathname}${destination.search}${destination.hash}`
			: destination.toString();
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
