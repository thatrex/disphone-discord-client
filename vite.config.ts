import { defineConfig, loadEnv } from 'vite'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import mkcert from 'vite-plugin-mkcert'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, './testing/', '')

	if (!env['VITE_DISCORD_TOKEN'])
		throw Error('Missing required environment variable: VITE_DISCORD_TOKEN')

	return {
		root: './testing/',
		resolve: { tsconfigPaths: true },
		plugins: [svelte({ preprocess: [vitePreprocess()], configFile: false }), mkcert()],
	}
})
