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

/** @see {@link https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code#value} */
export enum WebSocketCloseCodes {
	NormalClosure = 1000,
	GoingAway = 1001,
	ProtocolError = 1002,
	UnsupportedData = 1003,
	Reserved = 1004,
	NoStatusReceived = 1005,
	AbnormalClosure = 1006,
	InvalidFramePayloadData = 1007,
	PolicyViolation = 1008,
	MessageTooBig = 1009,
	MandatoryExt = 1010,
	InternalError = 1011,
	ServiceRestart = 1012,
	TryAgainLater = 1013,
	BadGateway = 1014,
	TLSHandshake = 1015,
}
