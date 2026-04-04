export type LogLevel = keyof typeof LogLevel
export const LogLevel = {
	info: 'info',
	log: 'log',
	debug: 'debug',
	warn: 'warn',
	error: 'error',
} as const

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
