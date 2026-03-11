import { defineConfig, devices } from '@playwright/test'

// import dotenv from 'dotenv'
// import path from 'path'
// dotenv.config({ path: path.resolve(__dirname, '.env') })

// https://playwright.dev/docs/test-configuration
export default defineConfig({
	testDir: './testing/tests',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL: 'https://localhost:5173',
		trace: 'on-first-retry',
		ignoreHTTPSErrors: true,
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
		// {
		// 	name: 'firefox',
		// 	use: { ...devices['Desktop Firefox'] },
		// },
		// {
		// 	name: 'webkit',
		// 	use: { ...devices['Desktop Safari'] },
		// },
	],
	webServer: {
		command: 'pnpm run dev',
		url: 'https://localhost:5173',
		reuseExistingServer: !process.env.CI,
		ignoreHTTPSErrors: true,
	},
})
