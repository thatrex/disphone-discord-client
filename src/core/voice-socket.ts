import EventEmitter from 'eventemitter3'
import { GatewayCloseCodes } from '@/types/gateway'
import { LogLevel, SocketState, WebSocketCloseCodes } from '@/types/common'
import {
	Codecs,
	VoiceCloseCodes,
	VoiceOpcodes,
	VoiceReceivePayload,
	VoiceGatewayVersion,
	VoiceSendPayload,
	VoiceReceivePayloadBinaryParsed,
} from '@/types/voice'
import { wait } from '@/utils/wait'
import * as Davey from '@snazzah/davey'

const RESUME_ATTEMPT_LIMIT = 3

const RESUMABLE_CLOSE_CODES = [
	WebSocketCloseCodes.NoStatusReceived,
	WebSocketCloseCodes.AbnormalClosure,
	GatewayCloseCodes.UnknownError,
	VoiceCloseCodes.UnknownOpcode,
	VoiceCloseCodes.FailedToDecode,
	VoiceCloseCodes.NotAuthenticated,
	VoiceCloseCodes.AlreadyAuthenticated,
	VoiceCloseCodes.SessionTimeout,
	VoiceCloseCodes.VoiceServerCrashed,
] as const

export interface VoiceSocket extends EventEmitter {
	emit(event: ''): boolean
	on(event: '', listener: () => void): this

	emit(event: LogLevel, ...data: any[]): boolean
	on(event: LogLevel, listener: (data: any[]) => void): this

	emit(event: 'state', state: SocketState): boolean
	on(event: 'state', listener: (state: SocketState) => void): this

	emit(event: 'payload.json', payload: VoiceReceivePayload): boolean
	on(event: 'payload.json', listener: (payload: VoiceReceivePayload) => void): this

	emit(event: 'payload.binary', payload: VoiceReceivePayloadBinaryParsed): boolean
	on(event: 'payload.binary', listener: (payload: VoiceReceivePayloadBinaryParsed) => void): this
}

export class VoiceSocket extends EventEmitter {
	private ws!: WebSocket

	private _state: SocketState = SocketState.INITIAL

	public get state(): SocketState {
		return this._state
	}

	private hartbeat_interval?: number
	private missed_heartbeats = 0
	private last_heartbeat_ack = 0
	private last_heartbeat_send = 0

	private _ping?: number

	public get ping(): number | undefined {
		return this._ping
	}

	private sequence = -1
	private indentified = false
	private resumed = false
	private resume_attempts = 0

	private connection: {
		session_id: string
		endpoint: string
		token: string
		guild_id: string
		user_id: string
	}

	constructor(params: {
		session_id: string
		endpoint: string
		token: string
		guild_id: string
		user_id: string
	}) {
		super()

		this.connection = params

		this.on('payload.json', (d) => this.onPayloadJSON(d))

		this.on('payload.binary', (b) => this.onPayloadBinary(b))

		this.on('state', (s) => {
			this._state = s
			this.emit('debug', `State update: ${s}`)
		})
	}

	/*
	PUBLIC
	*/

	public init(): void {
		this.initSocket()
	}

	public sendPayload(payload: VoiceSendPayload): void {
		if (this.ws.readyState !== WebSocket.OPEN) {
			this.emit('error', 'Unable to send payload, socket not open.')
			return
		}

		try {
			this.emit('debug', 'Sending payload:', payload)
			this.ws.send(JSON.stringify(payload))
		} catch (err) {
			this.emit('error', 'Error sending payload:', err)
		}
	}

	public sendSelectProtocol(sdp: string, codecs: Codecs): void {
		this.emit('debug', 'Selecting protocol')
		this.sendPayload({
			op: VoiceOpcodes.SelectProtocol,
			d: {
				protocol: 'webrtc',
				data: sdp,
				sdp: sdp,
				codecs,
			},
		})
	}

	public destroy(failed?: boolean): void {
		if (['DONE', 'FAILED'].includes(this.state)) return
		this.emit('state', failed ? SocketState.FAILED : SocketState.DONE)
		this.emit('debug', 'Destroying:', this.state)
		this.ws.close(1_000)
	}

	/*
	PRIVATE
	*/

	private initSocket(): void {
		if (this.state !== SocketState.RESUMING) this.emit('state', SocketState.INITIALISING)

		const address = `wss://${this.connection.endpoint}/?v=${VoiceGatewayVersion}`
		const bad_ready_states = [WebSocket.CONNECTING, WebSocket.OPEN] as number[]

		if (bad_ready_states.includes(this.ws?.readyState)) {
			this.emit('error', 'Socket is already open or connecting.')
			return
		}

		this.emit('debug', 'Initialising socket:', address)

		this.ws = new WebSocket(address)
		this.ws.binaryType = 'arraybuffer'
		this.ws.onopen = (e): void => this.onWebSocketOpen(e)
		this.ws.onclose = (e): void => this.onWebSocketClose(e)
		this.ws.onmessage = (e): void => this.onWebSocketMessage(e)
	}

	private onWebSocketOpen(event: Event): void {
		if (this.state !== SocketState.RESUMING) return

		const { guild_id: server_id, session_id, token } = this.connection

		this.sendPayload({
			op: VoiceOpcodes.Resume,
			d: { server_id, session_id, token, seq_ack: this.sequence },
		})

		this.resumed = false
		setTimeout(() => {
			if (this.resumed) return
			this.emit('debug', 'Failed to resume. Destroying.')
			this.destroy(true)
		}, 2500)
	}

	private onWebSocketClose({ code }: CloseEvent): void {
		clearInterval(this.hartbeat_interval)
		if (['DONE', 'FAILED'].includes(this.state)) return

		if (this.state === SocketState.RESUMING) {
			this.initSocket()
			return
		}

		if (RESUMABLE_CLOSE_CODES.includes(code)) {
			void this.attemptResume('Socket closed with resumable close code.')
			return
		}

		this.destroy()
	}

	private onWebSocketMessage({ data }: MessageEvent): void {
		if (typeof data === 'string') {
			try {
				const parsed = JSON.parse(data) as VoiceReceivePayload
				this.emit('payload.json', parsed)
			} catch (error) {
				this.emit('debug', 'Error Parsing Payload:', error)
			}
			return
		}

		if (data instanceof ArrayBuffer) {
			const v = new DataView(data)
			const a = new Uint8Array(data)

			const payload = {
				seq: v.getUint16(0),
				op: v.getUint8(2),
				data: a.subarray(3),
			} satisfies VoiceReceivePayloadBinaryParsed

			this.emit('payload.binary', payload)
			return
		}
	}

	private onPayloadJSON(payload: VoiceReceivePayload): void {
		this.emit('debug', 'Payload Received:', payload)

		if ('seq' in payload) this.sequence = payload.seq

		switch (payload.op) {
			case VoiceOpcodes.Hello: {
				this.initHartbeat(payload.d.heartbeat_interval)
				if (!this.indentified) this.sendIdentification()
				break
			}

			case VoiceOpcodes.Ready: {
				this.emit('state', SocketState.READY)
				break
			}

			case VoiceOpcodes.Resumed: {
				this.resume_attempts = 0
				this.resumed = true
				break
			}

			case VoiceOpcodes.HeartbeatAck: {
				this.last_heartbeat_ack = Date.now()
				this.missed_heartbeats = 0
				this._ping = this.last_heartbeat_ack - this.last_heartbeat_send
				this.emit('debug', `Ping: ${this.ping}`)
				break
			}
		}
	}

	private onPayloadBinary(payload: VoiceReceivePayloadBinaryParsed): void {
		this.emit('debug', 'Payload Received:', payload)

		if (payload.seq) this.sequence = payload.seq
	}

	private sendHeartbeat(): void {
		this.last_heartbeat_send = Date.now()
		this.missed_heartbeats++
		this.sendPayload({
			op: VoiceOpcodes.Heartbeat,
			d: { t: this.last_heartbeat_send, seq_ack: this.sequence },
		})
	}

	private initHartbeat(interval: number): void {
		this.emit('debug', 'Initialising heartbeat')
		clearInterval(this.hartbeat_interval)
		this.hartbeat_interval = window.setInterval(() => {
			if (this.last_heartbeat_send !== 0 && this.missed_heartbeats >= 3) {
				void this.attemptResume('Too many missed heartbeats.')
				return
			}
			this.sendHeartbeat()
		}, interval)
	}

	private async attemptResume(reason: string): Promise<void> {
		this.emit('debug', 'Attempting resume:', reason)

		if (this.resume_attempts >= RESUME_ATTEMPT_LIMIT) {
			this.emit(
				'debug',
				`Resume attempt limit (${RESUME_ATTEMPT_LIMIT}) reached. Destroying.`
			)
			this.destroy(true)
			return
		}

		this.resume_attempts++

		if (this.state === SocketState.RESUMING) {
			await wait(1000 * this.resume_attempts)
			if (this.state !== SocketState.RESUMING) return
		} else {
			this.emit('state', SocketState.RESUMING)
		}

		const acceptable_ready_states = [WebSocket.CLOSED, WebSocket.CLOSING] as number[]

		if (acceptable_ready_states.includes(this.ws.readyState)) {
			this.emit('debug', 'Resuming')
			this.initSocket()
			return
		}

		this.ws.close()
	}

	private sendIdentification(): void {
		this.emit('debug', 'Sending identification')

		this.indentified = true
		this.sendPayload({
			op: VoiceOpcodes.Identify,
			d: {
				token: this.connection.token,
				session_id: this.connection.session_id,
				user_id: this.connection.user_id,
				server_id: this.connection.guild_id,
				max_dave_protocol_version: Davey.DAVE_PROTOCOL_VERSION,
			},
		})
	}
}
