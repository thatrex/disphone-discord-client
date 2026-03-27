import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { playwright } from '@vitest/browser-playwright'
import mkcert from 'vite-plugin-mkcert'

// https://vitest.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, './testing/', '')

	if (!env['VITE_DISCORD_TOKEN'])
		throw Error('Missing required environment variable: VITE_DISCORD_TOKEN')

	return {
		resolve: { tsconfigPaths: true },
		plugins: [svelte({ preprocess: [vitePreprocess()], configFile: false }), mkcert()],
		test: {
			env,
			browser: {
				enabled: true,
				instances: [{ browser: 'chromium' }],
				provider: playwright({ contextOptions: { colorScheme: null } }),
			},
		},
	}
})
