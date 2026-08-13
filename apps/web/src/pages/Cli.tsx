import { useState } from "react";
import { Footer } from "../components/Footer";
import { Navbar } from "../components/Navbar";
import { getSeoMeta } from "../data/seo";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const INSTALL_COMMAND = "npm install --global @ooxml-dev/cli";
const EXAMPLE_COMMANDS = `ooxml login
ooxml search "paragraph spacing"
ooxml element w:p`;
const SKILL_COMMAND = "npx skills add superdoc/ooxml-dev --skill research-ooxml -g -y";

export function Cli() {
	useDocumentTitle(getSeoMeta("/cli").title);

	return (
		<div className="min-h-screen bg-[var(--color-bg-primary)]">
			<Navbar maxWidth />

			<main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
				<div className="mb-12 text-center">
					<div className="mb-4 inline-flex items-center rounded-full bg-[var(--color-accent)]/10 px-3 py-1 text-sm font-medium text-[var(--color-accent)]">
						OOXML CLI
					</div>
					<h1 className="mb-4 text-3xl font-bold">OOXML reference from your terminal</h1>
					<p className="mx-auto max-w-xl text-[var(--color-text-secondary)]">
						Search the ECMA-376 specification and inspect OOXML schemas without leaving your
						terminal.
					</p>
				</div>

				<section className="mb-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6">
					<h2 className="mb-2 font-semibold">Install</h2>
					<p className="mb-4 text-sm text-[var(--color-text-secondary)]">
						Node.js 20 or later is required.
					</p>
					<CommandBlock command={INSTALL_COMMAND} label="install command" />
				</section>

				<section className="mb-8">
					<h2 className="mb-2 font-semibold">Try it</h2>
					<p className="mb-4 text-sm text-[var(--color-text-secondary)]">
						Sign in, then search the spec or inspect an OOXML element.
					</p>
					<CommandBlock command={EXAMPLE_COMMANDS} label="example commands" multiline />
				</section>

				<div className="mb-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 text-sm text-[var(--color-text-secondary)]">
					The CLI uses the free, hosted ooxml.dev service. You may need to create an account and
					sign in. Sign-in is only used to control usage.
				</div>

				<section className="mb-10">
					<h2 className="mb-2 font-semibold">Use it with a coding agent</h2>
					<p className="mb-4 text-sm text-[var(--color-text-secondary)]">
						Install the CLI first, then add the <code>research-ooxml</code> skill. It shows coding
						agents how to combine spec search with schema evidence.
					</p>
					<CommandBlock command={SKILL_COMMAND} label="skill install command" />
				</section>

				<div className="flex flex-wrap gap-4 text-sm">
					<a
						href="https://www.npmjs.com/package/@ooxml-dev/cli"
						target="_blank"
						rel="noopener noreferrer"
						className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
					>
						View on npm →
					</a>
					<a
						href="https://github.com/superdoc/ooxml-dev/blob/main/apps/cli/README.md"
						target="_blank"
						rel="noopener noreferrer"
						className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
					>
						View all commands →
					</a>
				</div>
			</main>

			<Footer />
		</div>
	);
}

function CommandBlock({
	command,
	label,
	multiline = false,
}: {
	command: string;
	label: string;
	multiline?: boolean;
}) {
	const [copied, setCopied] = useState(false);

	const copy = () => {
		navigator.clipboard.writeText(command);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="flex items-start gap-3 rounded-lg bg-[var(--color-bg-code)] px-4 py-3">
			{multiline ? (
				<pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-sm text-[var(--color-syntax-value)]">
					<code>{command}</code>
				</pre>
			) : (
				<code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-[var(--color-syntax-value)]">
					{command}
				</code>
			)}
			<button
				type="button"
				onClick={copy}
				className="shrink-0 text-xs font-medium text-white hover:text-[var(--color-syntax-value)]"
				aria-label={`Copy ${label}`}
			>
				{copied ? "Copied" : "Copy"}
			</button>
		</div>
	);
}
