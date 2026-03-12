/** Wait for a defind amount of time. */
export function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
