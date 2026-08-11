import { ClerkFailed, ClerkLoaded, ClerkLoading, ClerkProvider, useAuth } from "@clerk/react";
import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AuthCard, AuthPage } from "./AuthCard";
import { useAuthContinueNavigation } from "./useAuthNavigation";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function AuthRoutes() {
	const { isLoaded, isSignedIn } = useAuth();
	const continueNavigation = useAuthContinueNavigation();
	const [sessionOnEntry, setSessionOnEntry] = useState<boolean>();
	const hasContinued = useRef(false);

	useEffect(() => {
		if (sessionOnEntry === undefined && isLoaded) {
			// Freeze the entry state so a session created by these forms finishes through finalize().
			setSessionOnEntry(isSignedIn === true);
		}
	}, [isLoaded, isSignedIn, sessionOnEntry]);

	useEffect(() => {
		if (sessionOnEntry !== true || hasContinued.current) return;
		hasContinued.current = true;
		void continueNavigation();
	}, [continueNavigation, sessionOnEntry]);

	if (sessionOnEntry !== false) {
		const isContinuing = sessionOnEntry === true;
		return (
			<AuthPage title={`${isContinuing ? "Finishing connection" : "Loading sign in"} | ooxml.dev`}>
				<AuthCard
					title={isContinuing ? "Finishing connection" : "Getting things ready"}
					subtitle={
						isContinuing ? "You're already signed in. Continuing…" : "Loading secure sign in…"
					}
				/>
			</AuthPage>
		);
	}

	return <Outlet />;
}

export function AuthProvider() {
	const navigate = useNavigate();

	if (!clerkPublishableKey) {
		return (
			<AuthPage title="Auth configuration needed | ooxml.dev">
				<AuthCard
					title="Auth isn't configured"
					subtitle="Add VITE_CLERK_PUBLISHABLE_KEY to use sign in and sign up."
				/>
			</AuthPage>
		);
	}

	const navigateWithRouter = (to: string, replace: boolean) => {
		const destination = new URL(to, window.location.origin);
		if (destination.origin !== window.location.origin) {
			window.location.assign(destination.toString());
			return;
		}

		void navigate(`${destination.pathname}${destination.search}${destination.hash}`, { replace });
	};

	return (
		<ClerkProvider
			publishableKey={clerkPublishableKey}
			signInUrl="/sign-in"
			signUpUrl="/sign-up"
			routerPush={(to) => navigateWithRouter(to, false)}
			routerReplace={(to) => navigateWithRouter(to, true)}
			// The auth screens are custom, so Clerk's prebuilt UI bundle is unnecessary here.
			prefetchUI={false}
		>
			<ClerkLoading>
				<AuthPage title="Loading sign in | ooxml.dev">
					<AuthCard title="Getting things ready" subtitle="Loading secure sign in…" />
				</AuthPage>
			</ClerkLoading>
			<ClerkLoaded>
				<AuthRoutes />
			</ClerkLoaded>
			<ClerkFailed>
				<AuthPage title="Sign in unavailable | ooxml.dev">
					<AuthCard
						title="Sign in is unavailable"
						subtitle="We couldn't load secure sign in. Refresh the page and try again."
					/>
				</AuthPage>
			</ClerkFailed>
		</ClerkProvider>
	);
}
