import EventEmitter from 'eventemitter3'
import { AudioSettings, LogLevel } from '@/types/common'
import { createPlaceholderStream } from '@/utils/create-placeholder-stream'
import { SDP } from '@/utils/sdp'
import { Codecs } from '@/types/voice'

const DEFAULT_AUDIO_SETTINGS = {
	stereo: false,
	bitrate_kbps: 64,
	mode: 'sendonly',
} as const satisfies AudioSettings

export type ReceiverToDo = keyof typeof ReceiverToDo
export const ReceiverToDo = {
	ADD: 'ADD',
	REMOVE: 'REMOVE',
	NOTHING: 'NOTHING',
} as const

export type TransceiverType = keyof typeof TransceiverType
export const TransceiverType = {
	SENDER: 'SENDER',
	RECEIVER: 'RECEIVER',
} as const

export type Transceiver = Sender | Receiver

export type Sender = {
	type: 'SENDER'
	transceiver: RTCRtpTransceiver
}

export type Receiver = (
	| { todo: Exclude<ReceiverToDo, 'REMOVE'>; transceiver?: RTCRtpTransceiver }
	| { todo: 'REMOVE'; transceiver: RTCRtpTransceiver }
) & {
	type: 'RECEIVER'
	ssrc: number
	user_id: string
}

export interface VoiceRTC extends EventEmitter {
	emit(event: ''): boolean
	on(event: '', listener: () => void): this

	emit(event: LogLevel, ...data: any[]): boolean
	on(event: LogLevel, listener: (data: any[]) => void): this

	emit(event: 'state', state: RTCPeerConnectionState): boolean
	on(event: 'state', listener: (state: RTCPeerConnectionState) => void): this
}

export class VoiceRTC extends EventEmitter {
	private readonly ac: AudioContext
	private readonly dst_i: MediaStreamAudioDestinationNode
	private readonly dst_o: MediaStreamAudioDestinationNode
	private readonly src_o: MediaStreamAudioSourceNode

	public get dst(): MediaStreamAudioDestinationNode {
		return this.dst_i
	}

	public get src(): MediaStreamAudioSourceNode {
		return this.src_o
	}

	private pc: RTCPeerConnection
	private audio_settings: AudioSettings
	private discord_sdp?: string
	private processing = false
	private transceivers: Transceiver[] = []

	get state(): RTCPeerConnectionState {
		return this.pc.connectionState
	}

	constructor(params: { ac: AudioContext; audio_settings?: Partial<AudioSettings> }) {
		super()

		this.ac = params.ac
		this.audio_settings = { ...DEFAULT_AUDIO_SETTINGS, ...params.audio_settings }
		this.dst_i = this.ac.createMediaStreamDestination()
		this.dst_o = this.ac.createMediaStreamDestination()
		this.src_o = this.ac.createMediaStreamSource(this.dst_o.stream)

		this.on('state', (s) => this.emit('debug', 'State update:', s))
		this.pc = new RTCPeerConnection()
		this.pc.onconnectionstatechange = (): void =>
			void this.emit('state', this.pc.connectionState)

		const [dummy_track] = createPlaceholderStream(this.ac).getAudioTracks()
		const transceiver = this.pc.addTransceiver(dummy_track!, { direction: 'sendonly' })
		const [track_i] = this.dst_i.stream.getAudioTracks()
		void transceiver.sender.replaceTrack(track_i!)

		this.transceivers.push({ type: TransceiverType.SENDER, transceiver })
	}

	/*
	PUBLIC
	*/

	/** Init the connection. */
	public async initConnection(): Promise<void | {
		ssrc: number
		select_protocol_sdp: string
		codecs: Codecs
	}> {
		if (this.pc.connectionState !== 'new') {
			this.emit('error', 'Peer Connection has already been initiated.')
			return
		}

		this.emit('debug', 'Initiating')

		const sdp = await this.createOffer()
		if (!sdp) return
		await this.pc.setLocalDescription({ type: 'offer', sdp })

		const ssrc = Number(sdp.match(/a=ssrc:(\d+) cname/)![1])
		const payload_type = Number(sdp.match(/a=rtpmap:(\d+) opus/)![1])
		const select_protocol_sdp = this.buildSelectProtocolSDP(sdp)

		return {
			ssrc,
			select_protocol_sdp,
			codecs: [
				{
					name: 'opus',
					type: 'audio',
					priority: 1000,
					payload_type,
					rtx_payload_type: null,
				},
			],
		}
	}

	public setDiscordSDP(sdp: string): void {
		this.emit('debug', `SDP Discord Raw:\n${sdp}`)
		this.discord_sdp = sdp
		void this.processReceivers()
	}

	/** Add user audio receiver if no active user receiver is found. */
	public addUserAudioReceiver(user_id: string, ssrc: number): void {
		if (this.audio_settings.mode === 'sendonly') return

		const receiver = this.getNonStoppedReceiver(user_id)

		if (!receiver) {
			this.transceivers.push({
				type: TransceiverType.RECEIVER,
				user_id,
				ssrc,
				todo: ReceiverToDo.ADD,
			})

			void this.processReceivers()
			return
		}

		if (receiver.todo === ReceiverToDo.REMOVE) {
			receiver.todo = ReceiverToDo.NOTHING as typeof ReceiverToDo.REMOVE
		}
	}

	/** Stop active user receiver. */
	public stopUserAudioReceiver(user_id: string): void {
		if (this.audio_settings?.mode === 'sendonly') return

		const receiver = this.getNonStoppedReceiver(user_id)

		if (!receiver) return

		if (receiver.todo === ReceiverToDo.ADD) {
			receiver.todo = ReceiverToDo.NOTHING
			return
		}

		receiver.todo = ReceiverToDo.REMOVE
		void this.processReceivers()
	}

	/** Stop all transceivers and closes connection. */
	public close(): void {
		if (this.pc.connectionState === 'closed') return
		this.emit('debug', 'Closing')
		for (const transceiver of this.pc.getTransceivers()) transceiver.stop()
		this.pc.close()
	}

	/*
	PRIVATE
	*/

	private buildSelectProtocolSDP(sdp: string): string {
		const s = new SDP(sdp.split('m=', 2).join('m=').trim())
		const attributes = ['fingerprint', 'ice-', 'extmap', 'rtpmap']
		s.set(s.parsed.filter(([, v]) => attributes.filter((a) => v.includes(a)).length))
		const select_protocol_sdp = s.stringified.trim().replaceAll('\r', '')
		this.emit('debug', `Select Protocol SDP:\n${select_protocol_sdp}`)
		return select_protocol_sdp
	}

	private async createOffer(): Promise<string | void> {
		const offer = await this.pc.createOffer()
		if (!offer.sdp) {
			this.emit('debug', 'Failed to create SDP offer.')
			return
		}
		this.emit('debug', `SDP Offer:\n${offer.sdp}`)
		return offer.sdp
	}

	private getNonStoppedReceiver(user_id: string): Receiver | undefined {
		const index = this.transceivers.findIndex((t) => {
			if (t.type === TransceiverType.SENDER) return false
			else return t.user_id === user_id && !t.transceiver?.stopped
		})

		return this.transceivers[index] as Receiver | undefined
	}

	private async processReceivers(): Promise<void> {
		if (this.processing || !this.discord_sdp) return

		this.emit('debug', 'Processing Started')
		this.processing = true

		for (const t of this.transceivers) {
			if (t.type === TransceiverType.SENDER) continue

			if (t.todo === ReceiverToDo.ADD) {
				const transceiver = this.pc.addTransceiver('audio', { direction: 'recvonly' })

				const stream = new MediaStream()
				stream.addTrack(transceiver.receiver.track)
				this.ac.createMediaStreamSource(stream).connect(this.dst_o)

				t.transceiver = transceiver
				t.todo = ReceiverToDo.NOTHING
				continue
			}

			if (t.todo === ReceiverToDo.REMOVE) {
				t.transceiver.stop()
				t.todo = ReceiverToDo.NOTHING as typeof ReceiverToDo.REMOVE
				continue
			}
		}

		try {
			await this.updatePeerConnection(this.discord_sdp)
		} catch (e) {
			console.warn('Error Updating Peer Connection: ', e)
		}

		const continueProcessing =
			!['closed', 'failed'].includes(this.pc.connectionState) &&
			this.transceivers.find((t) => {
				if (t.type === TransceiverType.SENDER) return false
				else return t.todo !== ReceiverToDo.NOTHING
			})

		this.processing = false

		if (continueProcessing) {
			this.emit('debug', `Processing Continuing`)
			await this.processReceivers()
			return
		}

		this.emit('debug', `Processing Done\ntransceivers:`, this.transceivers)
	}

	private async updatePeerConnection(discord_sdp: string): Promise<void> {
		const offer_sdp = await this.createOffer()
		if (!offer_sdp) return
		await this.pc.setLocalDescription({ type: 'offer', sdp: offer_sdp })

		const remote_sdp = new SDP()
		for (const [i, s] of offer_sdp.split('m=').entries()) {
			const section = new SDP(i === 0 ? s : `m=${s}`)
			const parsed_section = new SDP()

			// TODO: make this safe
			const [, in_ip4, rtcp, ice_ufrag, ice_pwd, fingerprint, candidate] = discord_sdp
				.replaceAll('\n\r', '\n')
				.split('\n')
				.map((line) => line.split('=')[1])

			if (i === 0) {
				for (const [chr, val] of section.parsed) {
					if (val.startsWith('fingerprint')) {
						parsed_section.add(chr, fingerprint!)
						continue
					}

					parsed_section.add(chr, val)
				}

				remote_sdp.concat(parsed_section.parsed)
				continue
			}

			const inactive_section = section.stringified.includes('inactive')
			if (inactive_section) {
				remote_sdp.concat(section.parsed)
				continue
			}

			const mid = section.stringified.match(/a=mid:(\d+)/)![1]
			const payload_type = offer_sdp.match(/a=rtpmap:(\d+) opus/)![1]
			const transceiver = this.transceivers.find(
				({ transceiver }) => transceiver?.mid === mid
			)!
			const rtcp_num = rtcp!.split(':')[1]

			for (const [chr, val] of section.parsed) {
				if (i === 1 && val.startsWith(`fmtp:${payload_type}`)) {
					const bitrate = this.audio_settings.bitrate_kbps * 1_000
					const stereo = this.audio_settings.stereo ? 1 : 0
					const v = `fmtp:${payload_type} minptime=10;useinbandfec=1;usedtx=1;stereo=${stereo};maxaveragebitrate=${bitrate}`
					parsed_section.add(chr, v)
				}

				if (val.startsWith('setup:actpass')) {
					parsed_section.add(chr, 'setup:passive')
					continue
				}

				if (chr === 'm') {
					parsed_section.add(chr, `audio ${rtcp_num} UDP/TLS/RTP/SAVPF ${payload_type}`)
					continue
				}

				if (chr === 'c') {
					parsed_section.add(chr, in_ip4!)
					continue
				}

				if (val.startsWith('fingerprint')) {
					parsed_section.add(chr, fingerprint!)
					continue
				}

				if (val.startsWith('ice-ufrag')) {
					parsed_section.add(chr, ice_ufrag!)
					continue
				}

				if (val.startsWith('ice-pwd')) {
					parsed_section.add(chr, ice_pwd!)
					continue
				}

				if (val.startsWith('sendonly')) {
					parsed_section.add(chr, 'recvonly')
					continue
				}

				if (val.startsWith('recvonly')) {
					parsed_section.add(chr, 'sendonly')
					continue
				}

				if (val.startsWith('candidate')) continue
				if (val.startsWith('end-of-candidates')) continue
				if (val.startsWith('ssrc')) continue
				if (val.startsWith('msid')) continue
				if (val.startsWith('rtcp:')) continue
				if (val.startsWith('rtpmap:') && !val.startsWith(`rtpmap:${payload_type}`)) continue
				if (val.startsWith('fmtp:') && !val.startsWith(`fmtp:${payload_type}`)) continue
				if (val.startsWith('rtcp-fb:') && !val.startsWith(`rtcp-fb:${payload_type}`))
					continue

				parsed_section.add(chr, val)
			}

			parsed_section.add('a', `rtcp:${rtcp_num}`)
			parsed_section.add('a', candidate!)

			if (transceiver.type === TransceiverType.RECEIVER) {
				const { user_id, ssrc } = transceiver
				parsed_section.add('a', `msid:${user_id}-${ssrc} a${user_id}-${ssrc}`)
				parsed_section.add('a', `ssrc:${ssrc} cname:${user_id}-${ssrc}`)
			}

			remote_sdp.concat(parsed_section.parsed)
		}

		this.emit('debug', `SDP Answer Parsed:\n${remote_sdp.stringified}`)
		await this.pc.setRemoteDescription({ type: 'answer', sdp: remote_sdp.stringified })
	}
}
