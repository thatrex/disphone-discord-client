// https://vite.dev/config/

import { defineConfig, loadEnv } from 'vite'
import mkcert from 'vite-plugin-mkcert'

const TEST_SITE_PATH = './testing/web/'

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, TEST_SITE_PATH, '')

	if (!env.VITE_DISCORD_TOKEN) throw Error('Missing required environment variable: VITE_DISCORD_TOKEN')

	return {
		root: TEST_SITE_PATH,
		plugins: [mkcert()],
	}
})
