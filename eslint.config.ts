import { defineConfig } from 'eslint/config'
import { fileURLToPath } from 'node:url'
import { includeIgnoreFile } from '@eslint/compat'
import globals from 'globals'
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import svelte from 'eslint-plugin-svelte'

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url))

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	eslint.configs.recommended,
	tseslint.configs.recommendedTypeChecked,
	{
		files: ['**/*.ts'],
		languageOptions: { parserOptions: { projectService: true } },
		rules: {
			'no-undef': 'off',
			'@typescript-eslint/explicit-function-return-type': 'error',
			'@typescript-eslint/no-unsafe-declaration-merging': 'off',
			'@typescript-eslint/no-unsafe-enum-comparison': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
		},
	},
	prettier,
	svelte.configs.recommended,
	svelte.configs.prettier,
	{
		files: ['**/*.svelte', '**/*.svelte.{ts,js}'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: tseslint.parser,
			},
		},
	},
	{
		languageOptions: { globals: { ...globals.browser } },
		rules: { 'no-undef': 'off' },
	}
)
