import EventEmitter from 'eventemitter3'
import { SocketState, AudioSettings, LogLevel } from '@/types/common'
import { GatewayOpcodes, GatewayDispatchEvents, GatewayReceivePayload } from '@/types/gateway'
import { Codecs, VoiceReceivePayload, VoiceOpcodes } from '@/types/voice'
import { VoiceManagerConnectionError } from './errors'
import { GatewaySocket } from './gateway-socket'
import { VoiceSocket } from './voice-socket'
import { VoiceRTC } from './voice-rtc'

export type VoiceManagerState = keyof typeof VoiceManagerState
export const VoiceManagerState = {
	INITIAL: 'INITIAL',
	CONNECTING: 'CONNECTING',
	CONNECTED: 'CONNECTED',
	RECONNECTING: 'RECONNECTING',
	DISCONNECTED: 'DISCONNECTED',
	FAILED: 'FAILED',
} as const

export interface VoiceManager extends EventEmitter {
	emit(event: ''): boolean
	on(event: '', listener: () => void): this

	emit(event: LogLevel, ...data: any[]): boolean
	on(event: LogLevel, listener: (data: any[]) => void): this

	emit(event: 'state', state: VoiceManagerState): boolean
	on(event: 'state', listener: (state: VoiceManagerState) => void): this
}

export class VoiceManager extends EventEmitter {
	private readonly ac: AudioContext
	private readonly dst_i: MediaStreamAudioDestinationNode
	private readonly src_i: MediaStreamAudioSourceNode
	private readonly dst_o: MediaStreamAudioDestinationNode
	private readonly src_o: MediaStreamAudioSourceNode

	public get dst(): MediaStreamAudioDestinationNode {
		return this.dst_i
	}

	public get src(): MediaStreamAudioSourceNode {
		return this.src_o
	}

	private gateway: GatewaySocket
	private voice?: VoiceSocket | undefined
	private rtc?: VoiceRTC | undefined

	private guild_id: string | null = null
	private channel_id: string | null = null
	private self_mute = false
	private self_deaf = false
	private speaking = false

	private audio_settings: AudioSettings

	private select_protocol_sdp?: string
	private endpoint?: string
	private codecs?: Codecs
	private token?: string
	private ssrc?: number

	private reconnect_attempts = 0

	private _state: VoiceManagerState = VoiceManagerState.INITIAL

	public get state(): VoiceManagerState {
		return this._state
	}

	constructor(params: {
		ac: AudioContext
		gateway_socket: GatewaySocket
		audio_settings?: Partial<AudioSettings>
	}) {
		super()

		const { ac, gateway_socket, audio_settings } = params

		this.ac = ac
		this.dst_i = this.ac.createMediaStreamDestination()
		this.src_i = this.ac.createMediaStreamSource(this.dst_i.stream)
		this.dst_o = this.ac.createMediaStreamDestination()
		this.src_o = this.ac.createMediaStreamSource(this.dst_o.stream)

		this.gateway = gateway_socket
		this.gateway.on('payload-json', (p) => this.onGatewayPacket(p as GatewayReceivePayload))
		this.gateway.on('state', (s) => ['DONE', 'FAILED'].includes(s) ?? this._disconnect())

		this.audio_settings = {
			stereo: audio_settings?.stereo ?? false,
			bitrate_kbps: audio_settings?.bitrate_kbps ?? 64,
			mode: audio_settings?.mode ?? 'sendonly',
		}

		this.on('state', (s) => {
			this._state = s
			this.emit('debug', `State update: ${s}`)
		})
	}

	/*
	PUBLIC
	*/

	// TODO: clean this up
	// TODO: fix: when moving/moved between channels _disconnect is called resulting in channel and guild IDs being nulled
	/** Update voice state. This can be used to connect/move channels, set speaking and update audio settings. Audio Settings will apply on reconnect. */
	public update(params: {
		guild_id?: string | null
		channel_id?: string | null
		self_mute?: boolean
		self_deaf?: boolean
		speaking?: boolean
		audio_settings?: Partial<AudioSettings>
	}): void {
		if (this.gateway.state !== SocketState.READY) {
			throw new VoiceManagerConnectionError('Gateway not ready.')
		}

		const { guild_id, channel_id, audio_settings, speaking, self_deaf, self_mute } = params

		if (audio_settings) {
			this.audio_settings = {
				stereo: audio_settings?.stereo ?? this.audio_settings.stereo,
				bitrate_kbps: audio_settings?.bitrate_kbps ?? this.audio_settings.bitrate_kbps,
				mode: audio_settings?.mode ?? this.audio_settings.mode,
			}
		}

		if (speaking !== undefined) this.setSpeaking(speaking)

		if (
			guild_id === undefined &&
			channel_id === undefined &&
			self_mute === undefined &&
			self_deaf === undefined
		) {
			return
		}

		this.guild_id = guild_id !== undefined ? guild_id : this.guild_id
		this.channel_id = channel_id !== undefined ? channel_id : this.channel_id
		this.self_mute = self_mute !== undefined ? self_mute : this.self_mute
		this.self_deaf = self_deaf !== undefined ? self_deaf : this.self_deaf

		this.gateway.sendPayload({
			op: GatewayOpcodes.VoiceStateUpdate,
			d: {
				guild_id: this.guild_id!,
				channel_id: this.channel_id,
				self_mute: this.self_mute,
				self_deaf: this.self_deaf,
			},
		})
	}

	public disconnect(): void {
		this.gateway.sendPayload({
			op: GatewayOpcodes.VoiceStateUpdate,
			d: {
				guild_id: this.guild_id!,
				channel_id: null,
				self_mute: this.self_mute,
				self_deaf: this.self_deaf,
			},
		})

		this._disconnect()
	}

	/*
	PRIVATE
	*/

	private async initConnection(endpoint: string, guild_id: string, token: string): Promise<void> {
		this.guild_id = guild_id
		this.token = token
		this.endpoint = endpoint

		this.rtc?.close()
		this.voice?.destroy()

		this.voice = new VoiceSocket({
			user_id: this.gateway.identity!.id,
			session_id: this.gateway.session_id!,
			endpoint,
			guild_id,
			token,
		})
		this.voice.on('state', () => this.updateState())
		this.voice.on('payload-json', (p) => this.onVoicePacket(p as VoiceReceivePayload))

		this.rtc = new VoiceRTC({ ac: this.ac })
		this.rtc.on('state', () => this.updateState())

		this.src_i.connect(this.rtc.dst)
		this.rtc.src.connect(this.dst_o)

		const detail = await this.rtc.initConnection()

		if (!detail) {
			this.emit('error', 'Failed to init RTC connection.')
			return
		}

		this.select_protocol_sdp = detail.select_protocol_sdp
		this.codecs = detail.codecs
		this.ssrc = detail.ssrc

		this.voice.init()
	}

	private updateState(): void {
		const rtc_state = this.rtc?.state
		const voice_state = this.voice?.state

		if (!rtc_state || !voice_state) return

		switch (true) {
			case this.state !== 'RECONNECTING' && ['DONE', 'FAILED'].includes(voice_state): {
				this._disconnect(voice_state === VoiceManagerState.FAILED)
				break
			}

			case rtc_state === 'failed': {
				if (
					!(this.reconnect_attempts > 1) &&
					this.endpoint &&
					this.guild_id &&
					this.token
				) {
					this.reconnect_attempts++
					this.emit('state', VoiceManagerState.RECONNECTING)
					void this.initConnection(this.endpoint, this.guild_id, this.token)
				} else this._disconnect(true)
				break
			}

			case this.state === 'RECONNECTING' && voice_state === 'RESUMING': {
				this.emit('state', VoiceManagerState.RECONNECTING)
				break
			}

			case this.state !== 'RECONNECTING' &&
				(voice_state === 'INITIALISING' || rtc_state === 'connecting'): {
				this.emit('state', VoiceManagerState.CONNECTING)
				break
			}

			case rtc_state === 'connected': {
				this.reconnect_attempts = 0
				this.emit('state', VoiceManagerState.CONNECTED)
				break
			}
		}
	}

	private onGatewayPacket(packet: GatewayReceivePayload): void {
		switch (packet.t) {
			case GatewayDispatchEvents.VoiceStateUpdate: {
				const { channel_id, user_id } = packet.d

				if (user_id !== this.gateway.identity!.id) break
				if (channel_id) break

				this.rtc?.close()
				this.voice?.destroy()

				break
			}

			case GatewayDispatchEvents.VoiceServerUpdate: {
				const { endpoint, guild_id, token } = packet.d
				if (!endpoint) break
				this.emit('state', VoiceManagerState.CONNECTING)
				void this.initConnection(endpoint, guild_id, token)
				break
			}
		}
	}

	private onVoicePacket(packet: VoiceReceivePayload): void {
		switch (packet.op) {
			case VoiceOpcodes.Ready: {
				this.voice!.sendSelectProtocol(this.select_protocol_sdp!, this.codecs!)
				break
			}

			case VoiceOpcodes.SessionDescription: {
				this.rtc!.setDiscordSDP(packet.d.sdp)
				this.setSpeaking(this.speaking)
				break
			}

			case VoiceOpcodes.Resumed: {
				this.setSpeaking(this.speaking)
				break
			}

			case VoiceOpcodes.Speaking: {
				const { user_id, ssrc, speaking } = packet.d
				if (speaking) this.rtc!.addUserAudioReceiver(user_id, ssrc)
				break
			}

			case VoiceOpcodes.ClientDisconnect: {
				const { user_id } = packet.d
				this.rtc!.stopUserAudioReceiver(user_id)
				break
			}
		}
	}

	private setSpeaking(speaking: boolean): void {
		this.speaking = speaking

		this.voice?.sendPayload({
			op: VoiceOpcodes.Speaking,
			d: {
				speaking: Number(speaking),
				ssrc: this.ssrc!,
				delay: 0,
			},
		})
	}

	private _disconnect(failed?: boolean): void {
		if (['DISCONNECTED', 'FAILED'].includes(this.state)) return

		if (failed && this.gateway.state === SocketState.READY) {
			this.gateway.sendPayload({
				op: GatewayOpcodes.VoiceStateUpdate,
				d: {
					guild_id: this.guild_id!,
					channel_id: null,
					self_mute: this.self_mute,
					self_deaf: this.self_deaf,
				},
			})
		}

		this.rtc?.close()
		this.voice?.destroy()

		this.rtc = undefined
		this.voice = undefined

		this.guild_id = null
		this.channel_id = null

		this.emit('state', failed ? VoiceManagerState.FAILED : VoiceManagerState.DISCONNECTED)
	}
}
