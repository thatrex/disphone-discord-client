import EventEmitter from 'eventemitter3'
import { GatewayIntentBits, GatewayVersion, PresenceUpdateStatus } from 'discord-api-types/v10'
import { LogLevel, SocketState, WebSocketCloseCodes } from '@/types/common'
import {
	GatewayReceivePayload,
	GatewayOpcodes,
	GatewayDispatchPayload,
	GatewayIdentifyProperties,
	GatewayPresenceUpdateData,
	GatewayDispatchEvents,
	GatewayCloseCodes,
	GatewaySendPayload,
} from '@/types/gateway'
import { wait } from '@/utils/wait'

export const DEFAULT_GATEWAY_ENDPOINT = 'gateway.discord.gg'

export const DEFAULT_IDENTIFY_PROPERTIES = {
	os: 'linux',
	browser: '',
	device: '',
} as const satisfies GatewayIdentifyProperties

export const DEFAULT_PRESENCE = {
	since: null,
	activities: [],
	status: PresenceUpdateStatus.Online,
	afk: false,
} as const satisfies GatewayPresenceUpdateData

const RESUME_ATTEMPT_LIMIT = 3

const RESUMABLE_CLOSE_CODES = [
	WebSocketCloseCodes.NoStatusReceived,
	WebSocketCloseCodes.AbnormalClosure,
	GatewayCloseCodes.UnknownError,
	GatewayCloseCodes.UnknownOpcode,
	GatewayCloseCodes.DecodeError,
	GatewayCloseCodes.NotAuthenticated,
	GatewayCloseCodes.AlreadyAuthenticated,
	GatewayCloseCodes.InvalidSeq,
	GatewayCloseCodes.RateLimited,
	GatewayCloseCodes.SessionTimedOut,
] as const

export interface GatewaySocket extends EventEmitter {
	emit(event: ''): boolean
	on(event: '', listener: () => void): this

	emit(event: LogLevel, ...data: any[]): boolean
	on(event: LogLevel, listener: (data: any[]) => void): this

	emit(event: 'state', state: SocketState): boolean
	on(event: 'state', listener: (state: SocketState) => void): this

	emit(event: 'payload.json', payload: GatewayReceivePayload): boolean
	on(event: 'payload.json', listener: (payload: GatewayReceivePayload) => void): this
}

export class GatewaySocket extends EventEmitter {
	private ws!: WebSocket

	private ds = new DecompressionStream('deflate')

	private hartbeat_interval?: number
	private missed_heartbeats = 0
	private sequence: number | null = null

	private indentified = false

	private resumed = false
	private resume_attempts = 0

	private _state: SocketState = SocketState.INITIAL

	public get state(): SocketState {
		return this._state
	}

	private connection: {
		properties: GatewayIdentifyProperties
		intents: GatewayIntentBits
		token: string
		session_id?: string
		resume_gateway_endpoint?: string
	}

	public get session_id(): string | undefined {
		return this.connection.session_id
	}

	private _identity?: {
		id: string
		username: string
		discriminator: string
		bot: boolean
	}

	public get identity(): GatewaySocket['_identity'] {
		return this._identity
	}

	private presence: GatewayPresenceUpdateData

	constructor(params: {
		token: string
		intents: GatewayIntentBits
		properties?: GatewayIdentifyProperties
		presence?: GatewayPresenceUpdateData
	}) {
		super()

		const { token, intents, properties, presence } = params

		this.presence = presence ?? DEFAULT_PRESENCE
		this.connection = {
			token,
			intents,
			properties: properties ?? DEFAULT_IDENTIFY_PROPERTIES,
		}

		this.on('payload.json', (p) => this.onPayloadJSON(p))
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

	public sendPayload(packet: GatewaySendPayload): void {
		if (this.ws.readyState !== WebSocket.OPEN) {
			this.emit('error', 'Unable to send frame, socket not open.')
			return
		}

		try {
			this.emit('debug', 'Sending packet:', packet)
			this.ws.send(JSON.stringify(packet))
		} catch (err) {
			this.emit('error', 'Error sending packet:', err)
		}
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

		const endpoint =
			(this.state === SocketState.RESUMING
				? this.connection.resume_gateway_endpoint
				: undefined) ?? DEFAULT_GATEWAY_ENDPOINT
		const address = `wss://${endpoint}/?v=${GatewayVersion}`
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

		this.sendPayload({
			op: GatewayOpcodes.Resume,
			d: {
				token: this.connection.token,
				seq: this.sequence!,
				session_id: this.connection.session_id!,
			},
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

		this.destroy(code === GatewayCloseCodes.AuthenticationFailed)
	}

	private onWebSocketMessage({ data }: MessageEvent): void {
		if (typeof data === 'string') {
			try {
				const parsed = JSON.parse(data) as GatewayReceivePayload
				this.emit('debug', 'Frame received:', parsed)
				this.emit('payload.json', parsed)
			} catch (error) {
				this.emit('debug', 'Error parsing frame:', error)
			}
			return
		}

		if (data instanceof ArrayBuffer) {
			const stream = new Blob([data]).stream().pipeThrough(this.ds)
			void new Response(stream)
				.json()
				.then((json) => this.emit('payload.json', json as GatewayReceivePayload))
			return
		}
	}

	private onPayloadJSON(payload: GatewayReceivePayload): void {
		switch (payload.op) {
			case GatewayOpcodes.Heartbeat: {
				this.sendHeartbeat()
				break
			}

			case GatewayOpcodes.Hello: {
				this.initHartbeat(payload.d.heartbeat_interval)
				if (!this.indentified) this.sendIdentification()
				break
			}

			case GatewayOpcodes.HeartbeatAck: {
				this.missed_heartbeats = 0
				break
			}

			case GatewayOpcodes.InvalidSession: {
				if (payload.d === true) void this.attemptResume('Invalid session packet received.')
				else this.destroy()
				break
			}

			case GatewayOpcodes.Reconnect: {
				void this.attemptResume('Reconnect packet received')
				break
			}

			case GatewayOpcodes.Dispatch: {
				this.onDispatch(payload)
				break
			}
		}
	}

	private onDispatch(packet: GatewayDispatchPayload): void {
		this.sequence = packet.s

		switch (packet.t) {
			case GatewayDispatchEvents.Ready: {
				const {
					session_id,
					resume_gateway_url,
					user: { id, username, discriminator, bot },
				} = packet.d

				const resume_gateway_endpoint = resume_gateway_url.replace('wss://', '')

				this.connection = { ...this.connection, session_id, resume_gateway_endpoint }
				this._identity = { id, username, discriminator, bot: !!bot }

				this.emit('state', SocketState.READY)
				break
			}

			case GatewayDispatchEvents.Resumed: {
				this.resumed = true
				this.resume_attempts = 0

				this.emit('state', SocketState.READY)
				break
			}
		}
	}

	private sendHeartbeat(): void {
		this.missed_heartbeats++
		this.sendPayload({
			op: GatewayOpcodes.Heartbeat,
			d: this.sequence,
		})
	}

	private initHartbeat(interval: number): void {
		this.emit('debug', 'Initialising heartbeat')
		this.missed_heartbeats = 0
		clearInterval(this.hartbeat_interval)
		this.hartbeat_interval = window.setInterval(() => {
			if (this.missed_heartbeats >= 3) {
				void this.attemptResume('Too many missed heartbeats.')
				return
			}
			this.sendHeartbeat()
		}, interval * Math.random())
	}

	private async attemptResume(reason: string): Promise<void> {
		this.emit('debug', 'Maybe Resuming. Reason:', reason)

		if (this.resume_attempts >= RESUME_ATTEMPT_LIMIT) {
			this.emit(
				'debug',
				`Resume attempt limit (${RESUME_ATTEMPT_LIMIT}) reached. Destroying.`
			)
			this.destroy(true)
			return
		}

		if (!this.connection.session_id) {
			this.emit('debug', 'Data required for resume unavailable.')
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
		this.emit('debug', 'Sending Identification')

		this.indentified = true
		this.sendPayload({
			op: GatewayOpcodes.Identify,
			d: {
				compress: true,
				token: this.connection.token,
				intents: this.connection.intents,
				properties: this.connection.properties,
				// presence: this.presence,
				// ^ initial presence not respected
			},
		})

		this.sendPayload({
			op: GatewayOpcodes.PresenceUpdate,
			d: this.presence,
		})
	}
}
