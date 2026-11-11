import { privacyTitle, privacySections, privacyLinks } from "../lib/privacy-content.mjs";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function Privacy() {
	useDocumentTitle(`${privacyTitle} | ooxml.dev`);
	return (
		<main className="site-privacy-page">
			<a href="/">Back to ooxml.dev</a>
			<h1>{privacyTitle}</h1>
			<p>Cookie choices for ooxml.dev.</p>
			{privacySections.map((section) => (
				<section key={section.title}>
					<h2>{section.title}</h2>
					<p>{section.text}</p>
				</section>
			))}
			<section id="cookie-settings">
				<h2>Cookie settings</h2>
				<button type="button" data-consent-open>
					Open cookie settings
				</button>
			</section>
			<ul>
				{privacyLinks.map((link) => (
					<li key={link.href}>
						<a href={link.href}>{link.label}</a>
					</li>
				))}
			</ul>
			<p>
				<a href="/privacy.md">Read this notice as Markdown</a>
			</p>
		</main>
	);
}
