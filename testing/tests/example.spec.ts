import { expect, test } from 'vitest'
import { render } from 'vitest-browser-svelte'
import Testing from '../components/Example.svelte'

test('has content', async () => {
	const page = render(Testing)
	const el = page.getByText(/Hello World/i)
	await expect.element(el).toBeInTheDocument()
})
