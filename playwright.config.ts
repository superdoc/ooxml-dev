import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/browser",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:19138",
		browserName: "chromium",
		viewport: { width: 1440, height: 1000 },
		trace: "retain-on-failure",
	},
	webServer: {
		command: "bun run --cwd apps/web dev --host 127.0.0.1 --port 19138 --strictPort",
		url: "http://127.0.0.1:19138/spec",
		reuseExistingServer: false,
		env: { VITE_API_URL: "http://127.0.0.1:19138/__test_api" },
	},
});
