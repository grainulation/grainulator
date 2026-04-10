import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./test",
	testMatch: "*.e2e.js",
	timeout: 30_000,
	retries: 0,
	use: {
		baseURL: "http://localhost:3900",
		headless: true,
		viewport: { width: 1280, height: 720 },
		ignoreHTTPSErrors: true,
	},
	projects: [
		{ name: "chromium", use: { browserName: "chromium" } },
	],
	webServer: {
		command: "npx serve site -l 3900 --no-clipboard",
		port: 3900,
		reuseExistingServer: true,
		timeout: 10_000,
	},
});
