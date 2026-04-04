/** Creates a placeholder media stream containing 1 audio track with 2 channels. */
export function createPlaceholderStream(ac: AudioContext): MediaStream {
	const dest = ac.createMediaStreamDestination()
	const buffer_source = ac.createBufferSource()
	buffer_source.buffer = ac.createBuffer(2, ac.sampleRate, ac.sampleRate)
	buffer_source.connect(dest)
	return dest.stream
}
