export type SocketState = keyof typeof SocketState
export const SocketState = {
	INITIAL: 'INITIAL',
	INITIALISING: 'INITIALISING',
	READY: 'READY',
	RESUMING: 'RESUMING',
	DONE: 'DONE',
	FAILED: 'FAILED',
} as const

export type AudioSettings = {
	bitrate_kbps: number
	stereo: boolean
	mode: 'sendrecv' | 'sendonly'
}
