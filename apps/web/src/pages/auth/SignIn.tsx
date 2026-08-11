import { useSignIn } from "@clerk/react";
import { type FormEvent, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
	AuthCard,
	AuthInput,
	AuthMessage,
	AuthPage,
	AuthSubmitButton,
	authLinkClassName,
} from "./AuthCard";
import { useAuthFinalizeNavigation } from "./useAuthNavigation";

type Step = "email" | "code";

function displayError(error: { longMessage?: string; message?: string } | null | undefined) {
	return error?.longMessage ?? error?.message;
}

export function SignIn() {
	const { signIn, errors, fetchStatus } = useSignIn();
	const finalizeNavigation = useAuthFinalizeNavigation();
	const location = useLocation();
	const [step, setStep] = useState<Step>("email");
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [localError, setLocalError] = useState<string>();
	const [notice, setNotice] = useState<string>();
	const isLoading = fetchStatus === "fetching";
	const fieldError = step === "email" ? errors.fields.identifier : errors.fields.code;
	const errorMessage = localError ?? displayError(fieldError) ?? displayError(errors.global?.[0]);

	async function sendCode(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setLocalError(undefined);
		setNotice(undefined);

		try {
			const result = await signIn.emailCode.sendCode({ emailAddress: email.trim() });
			if (result.error) {
				setLocalError(displayError(result.error) ?? "We couldn't send the code. Try again.");
				return;
			}

			setEmail(email.trim());
			setStep("code");
		} catch {
			setLocalError("We couldn't send the code. Check your connection and try again.");
		}
	}

	async function verifyCode(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setLocalError(undefined);
		setNotice(undefined);

		try {
			const verification = await signIn.emailCode.verifyCode({ code });
			if (verification.error) {
				setLocalError(
					displayError(verification.error) ?? "That code didn't work. Check it and try again.",
				);
				return;
			}

			if (signIn.status !== "complete") {
				setLocalError(
					"This account needs another verification step that isn't supported here yet.",
				);
				return;
			}

			const finalized = await signIn.finalize({ navigate: finalizeNavigation });
			if (finalized.error) {
				setLocalError(displayError(finalized.error) ?? "We couldn't finish signing you in.");
			}
		} catch {
			setLocalError("We couldn't verify the code. Check your connection and try again.");
		}
	}

	async function resendCode() {
		setLocalError(undefined);
		setNotice(undefined);

		try {
			const result = await signIn.emailCode.sendCode();
			if (result.error) {
				setLocalError(displayError(result.error) ?? "We couldn't send another code.");
				return;
			}
			setNotice("A new code is on its way.");
		} catch {
			setLocalError("We couldn't send another code. Try again.");
		}
	}

	async function changeEmail() {
		await signIn.reset();
		setCode("");
		setLocalError(undefined);
		setNotice(undefined);
		setStep("email");
	}

	if (step === "code") {
		return (
			<AuthPage title="Check your email | ooxml.dev">
				<AuthCard
					title="Check your email"
					subtitle={
						<>
							Enter the six-digit code we sent to <strong>{email}</strong>.
						</>
					}
					footer={
						<>
							Wrong email?{" "}
							<button type="button" onClick={changeEmail} className={authLinkClassName}>
								Change it
							</button>
						</>
					}
				>
					<form onSubmit={verifyCode} noValidate>
						<AuthInput
							id="sign-in-code"
							label="Verification code"
							value={code}
							onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
							placeholder="123456"
							autoComplete="one-time-code"
							inputMode="numeric"
							maxLength={6}
							invalid={Boolean(errorMessage)}
							autoFocus
						/>
						{errorMessage ? <AuthMessage>{errorMessage}</AuthMessage> : null}
						{notice ? <AuthMessage tone="info">{notice}</AuthMessage> : null}
						<AuthSubmitButton disabled={isLoading || code.length !== 6}>
							{isLoading ? "Checking…" : "Verify code"}
						</AuthSubmitButton>
					</form>
					<p className="mb-0 mt-4 text-center text-[13px] text-[var(--color-text-secondary)]">
						Didn't get it?{" "}
						<button
							type="button"
							onClick={resendCode}
							disabled={isLoading}
							className={`${authLinkClassName} disabled:cursor-not-allowed disabled:opacity-60`}
						>
							Send another code
						</button>
					</p>
				</AuthCard>
			</AuthPage>
		);
	}

	return (
		<AuthPage title="Sign in | ooxml.dev">
			<AuthCard
				title="Connect to ooxml.dev"
				subtitle="Sign in to finish connecting your MCP client."
				footer={
					<>
						New here?{" "}
						<Link
							to={{ pathname: "/sign-up", search: location.search }}
							className={authLinkClassName}
						>
							Create an account
						</Link>
					</>
				}
			>
				<form onSubmit={sendCode} noValidate>
					<AuthInput
						id="sign-in-email"
						label="Email"
						type="email"
						value={email}
						onChange={setEmail}
						placeholder="you@company.com"
						autoComplete="email"
						inputMode="email"
						invalid={Boolean(errorMessage)}
						autoFocus
					/>
					{errorMessage ? <AuthMessage>{errorMessage}</AuthMessage> : null}
					<AuthSubmitButton disabled={isLoading || !email.trim()}>
						{isLoading ? "Sending code…" : "Continue"}
					</AuthSubmitButton>
				</form>
			</AuthCard>
		</AuthPage>
	);
}
