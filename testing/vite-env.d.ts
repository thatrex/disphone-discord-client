/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_DISCORD_TOKEN: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
