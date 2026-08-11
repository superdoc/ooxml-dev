import { type ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";

interface AuthPageProps {
	title: string;
	children: ReactNode;
}

interface AuthCardProps {
	title: string;
	subtitle: ReactNode;
	children?: ReactNode;
	footer?: ReactNode;
}

interface AuthInputProps {
	id: string;
	label: string;
	type?: "email" | "text";
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	autoComplete: string;
	inputMode?: "email" | "numeric";
	maxLength?: number;
	invalid?: boolean;
	autoFocus?: boolean;
}

export function AuthPage({ title, children }: AuthPageProps) {
	useEffect(() => {
		const previousTitle = document.title;
		const existingRobots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
		const previousRobots = existingRobots?.content;
		const existingAuthMeta = existingRobots?.hasAttribute("data-auth-page") ?? false;
		const robots = existingRobots ?? document.createElement("meta");

		if (!existingRobots) {
			robots.name = "robots";
			document.head.appendChild(robots);
		}

		document.title = title;
		robots.content = "noindex, nofollow";
		robots.setAttribute("data-auth-page", "");

		return () => {
			document.title = previousTitle;
			if (existingRobots && !existingAuthMeta && previousRobots !== undefined) {
				existingRobots.content = previousRobots;
				existingRobots.removeAttribute("data-auth-page");
			} else {
				robots.remove();
			}
		};
	}, [title]);

	return (
		<main className="flex min-h-screen items-center justify-center bg-[var(--color-bg-secondary)] px-4 py-12">
			{children}
		</main>
	);
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
	return (
		<section
			aria-labelledby="auth-card-title"
			className="w-full max-w-96 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-8 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_8px_24px_rgba(28,25,23,0.04)]"
		>
			<Link
				to="/"
				aria-label="ooxml.dev home"
				className="mb-6 flex items-baseline justify-center gap-px text-[19px] font-bold tracking-[-0.02em] text-[var(--color-text-primary)] no-underline"
			>
				<span
					className="font-medium text-[var(--color-accent)]"
					style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
				>
					&lt;
				</span>
				ooxml.dev
				<span
					className="font-medium text-[var(--color-accent)]"
					style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
				>
					/&gt;
				</span>
			</Link>

			<h1 id="auth-card-title" className="m-0 text-center text-xl font-semibold tracking-[-0.01em]">
				{title}
			</h1>
			<p className="mb-6 mt-1.5 text-center text-sm leading-5 text-[var(--color-text-secondary)]">
				{subtitle}
			</p>

			{children}

			{footer ? (
				<div className="mt-5 border-t border-[var(--color-border)] pt-5 text-center text-[13px] text-[var(--color-text-secondary)]">
					{footer}
				</div>
			) : null}
		</section>
	);
}

export function AuthInput({
	id,
	label,
	type = "text",
	value,
	onChange,
	placeholder,
	autoComplete,
	inputMode,
	maxLength,
	invalid = false,
	autoFocus = false,
}: AuthInputProps) {
	return (
		<div>
			<label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">
				{label}
			</label>
			<input
				id={id}
				type={type}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				autoComplete={autoComplete}
				inputMode={inputMode}
				maxLength={maxLength}
				autoFocus={autoFocus}
				required
				aria-invalid={invalid}
				className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-primary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_rgba(194,65,12,0.12)]"
			/>
		</div>
	);
}

export function AuthSubmitButton({
	children,
	disabled,
}: {
	children: ReactNode;
	disabled?: boolean;
}) {
	return (
		<button
			type="submit"
			disabled={disabled}
			className="mt-4 w-full cursor-pointer rounded-lg border-0 bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
		>
			{children}
		</button>
	);
}

export function AuthMessage({
	children,
	tone = "error",
}: {
	children: ReactNode;
	tone?: "error" | "info";
}) {
	return (
		<p
			role={tone === "error" ? "alert" : "status"}
			className={`mb-0 mt-2 text-[13px] leading-5 ${tone === "error" ? "text-red-700" : "text-[var(--color-text-secondary)]"}`}
		>
			{children}
		</p>
	);
}

export const authLinkClassName =
	"font-medium text-[var(--color-accent)] no-underline hover:text-[var(--color-accent-hover)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";
