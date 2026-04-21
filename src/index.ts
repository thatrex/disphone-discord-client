import EventEmitter from 'eventemitter3'
import {
	GatewayIdentifyProperties,
	GatewayPresenceUpdateData,
	GatewayOpcodes,
} from 'discord-api-types/v10'
import { AudioSettings, SocketState } from './types/common'
import { GatewaySocket } from './core/gateway/socket'
import { VoiceManager } from './core/voice/manager'

interface Client extends EventEmitter {
	on(event: '', listener: () => void): this
	on(event: 'state', listener: (state: SocketState) => void): this
	emit(event: ''): boolean
	emit(event: 'state', state: SocketState): boolean
}

class Client extends EventEmitter {
	private _gateway: GatewaySocket

	public debug: boolean

	public get gateway(): GatewaySocket {
		return this._gateway
	}

	public get state(): SocketState {
		return this.gateway.state
	}

	constructor(params: {
		token: string
		intents: number
		properties?: GatewayIdentifyProperties
		presence?: GatewayPresenceUpdateData
		debug?: boolean
	}) {
		super()

		this.debug = params.debug ?? false

		this._gateway = new GatewaySocket({
			token: params.token,
			intents: params.intents,
			presence: params.presence!,
			properties: params.properties!,
		})

		this._gateway.on('state', (s) => this.emit('state', s))

		this._gateway.on('error', (...m) => console.error('[Gateway Socket]', ...m))
		this._gateway.on('warn', (...m) => console.warn('[Gateway Socket]', ...m))
		this._gateway.on('info', (...m) => console.info('[Gateway Socket]', ...m))
		this._gateway.on('log', (...m) => console.log('[Gateway Socket]', ...m))
		this._gateway.on('debug', (...m) => this.debug && console.debug('[Gateway Socket]', ...m))
	}

	public start(): void {
		this.gateway.init()
	}

	public setPresence(params: GatewayPresenceUpdateData): void {
		this._gateway.sendPayload({
			op: GatewayOpcodes.PresenceUpdate,
			d: params,
		})
	}

	/** Ensure user media access is granted **before** attempting to join a voice channel. Not doing so will result in the RTC connection failing. */
	public createVoiceManager(params: {
		ac: AudioContext
		audio_settings?: Partial<AudioSettings>
	}): VoiceManager {
		const vm = new VoiceManager({
			ac: params.ac,
			gateway_socket: this._gateway,
			audio_settings: params.audio_settings!,
		})

		vm.on('error', (...m) => console.error('[Voice Manager]', ...m))
		vm.on('warn', (...m) => console.warn('[Voice Manager]', ...m))
		vm.on('info', (...m) => console.info('[Voice Manager]', ...m))
		vm.on('log', (...m) => console.log('[Voice Manager]', ...m))
		vm.on('debug', (...m) => this.debug && console.debug('[Voice Manager]', ...m))

		return vm
	}

	public shutdown(): void {
		this._gateway.destroy()
	}
}

export { Client }
export default Client
