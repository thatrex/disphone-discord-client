import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import mkcert from 'vite-plugin-mkcert'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, './testing/', '')

	if (!env.VITE_DISCORD_TOKEN)
		throw Error('Missing required environment variable: VITE_DISCORD_TOKEN')

	return {
		plugins: [svelte(), mkcert()],
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
