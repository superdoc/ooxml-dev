import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const envKeys = ["VITE_CLERK_PUBLISHABLE_KEY", "CLERK_PUBLISHABLE_KEY"];
	const rootEnv = loadEnv(mode, resolve(__dirname, "../.."), envKeys);
	const webEnv = loadEnv(mode, __dirname, envKeys);
	const clerkPublishableKey =
		process.env.VITE_CLERK_PUBLISHABLE_KEY ??
		process.env.CLERK_PUBLISHABLE_KEY ??
		webEnv.VITE_CLERK_PUBLISHABLE_KEY ??
		webEnv.CLERK_PUBLISHABLE_KEY ??
		rootEnv.VITE_CLERK_PUBLISHABLE_KEY ??
		rootEnv.CLERK_PUBLISHABLE_KEY ??
		"";

	return {
		plugins: [tailwindcss(), react()],
		// The browser only receives Clerk's public key; secret keys remain server-only.
		define: {
			"import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(clerkPublishableKey),
		},
		resolve: {
			alias: {
				"@": resolve(__dirname, "src"),
			},
		},
	};
});
