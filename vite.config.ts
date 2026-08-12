import { defineConfig } from "vite-plus";

export default defineConfig({
	defaultPackage: "./apps/web",
	fmt: {
		ignorePatterns: [
			".changeset/config.json",
			"**/*.html",
			"**/*.md",
			"**/*.toml",
			"**/package.json",
			"data/sources.json",
			"tests/**",
		],
		printWidth: 100,
		sortPackageJson: false,
		useTabs: true,
	},
	lint: {
		plugins: ["react"],
		jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
		rules: { "vite-plus/prefer-vite-plus-imports": "error" },
		// TypeScript projects are checked by `bun run typecheck`; Vite+'s current
		// type checker treats Bun scripts and Cloudflare Workers as one project.
		options: { typeAware: true, typeCheck: false },
	},
	staged: {
		"*.{js,jsx,ts,tsx,json,css,yaml,yml}": "vp check --fix",
	},
});
