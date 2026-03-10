/**
 * Wait for a defind amount of time.
 */
export function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Generates a dummy media stream containing 1 audio track with 2 channels.
 */
export function generateDummyStream(ac: AudioContext) {
	const dest = ac.createMediaStreamDestination()
	const buffer_source = ac.createBufferSource()
	buffer_source.buffer = ac.createBuffer(2, ac.sampleRate, ac.sampleRate)
	buffer_source.connect(dest)
	return dest.stream
}

/**
 * A no operation function (does nothing)
 */
export const noop = () => {}
