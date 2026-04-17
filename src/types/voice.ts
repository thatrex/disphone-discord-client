import { Snowflake } from 'discord-api-types/globals'
import type {
	_DataPayload,
	VoiceOpcodes,
	VoiceUDPProtocolData,
	VoiceDaveMlsInvalidCommitWelcome,
	VoiceDaveTransitionReady,
	VoiceHeartbeat,
	VoiceResume,
	VoiceSpeakingSend,
	VoiceClientDisconnect,
	VoiceClientsConnect,
	VoiceDaveExecuteTransition,
	VoiceDavePrepareEpoch,
	VoiceDavePrepareTransition,
	VoiceHeartbeatAck,
	VoiceHello,
	VoiceResumed,
	VoiceSpeaking,
} from 'discord-api-types/voice'

/* 
Discord voice WebRTC has some differences to the documented UDP protocol.  
The types Below could be considered `discord-api-types/voice-webrtc`.
*/

export * from 'discord-api-types/voice'
export type * from 'discord-api-types/voice'

export type VoiceSendPayload =
	| VoiceDaveMlsInvalidCommitWelcome
	| VoiceDaveTransitionReady
	| VoiceHeartbeat
	| VoiceIdentify
	| VoiceResume
	| VoiceSelectProtocol
	| VoiceSpeakingSend
export type VoiceReceivePayload =
	| VoiceClientDisconnect
	| VoiceClientsConnect
	| VoiceDaveExecuteTransition
	| VoiceDavePrepareEpoch
	| VoiceDavePrepareTransition
	| VoiceHeartbeatAck
	| VoiceHello
	| VoiceReady
	| VoiceResumed
	| VoiceSessionDescription
	| VoiceSpeaking

export type VoiceReceivePayloadBinaryParsed = {
	seq: number
	op: number
	data: Uint8Array<ArrayBuffer>
}

/** @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-websocket-connection} */
export type VoiceIdentify = _DataPayload<VoiceOpcodes.Identify, VoiceIdentifyData>
/** @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-websocket-connection} */
export type VoiceIdentifyData = {
	/** The id of the server to connect to */
	server_id: Snowflake
	/** The id of the user to connect as */
	user_id: Snowflake
	/** Voice state session id */
	session_id: string
	/** Voice connection token */
	token: string
	/** The maximum DAVE protocol version supported */
	max_dave_protocol_version?: number
	/** Undocumented: ?? If the client has video capabilities */
	video?: boolean
	/** Undocumented */
	streams?: {
		type: string
		rid: string
		quality: number
	}[]
}

/** @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-udp-connection} */
export type VoiceSelectProtocol = _DataPayload<VoiceOpcodes.SelectProtocol, VoiceSelectProtocolData>
/** @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-udp-connection} */
export type Codecs = {
	name: string
	type: string
	priority: number
	payload_type: number
	rtx_payload_type: number | null
}[]
// prettier-ignore
export type VoiceSelectProtocolData =
	{
		/** Voice protocol */
		protocol: 'udp'
		/** Data associated with the protocol */
		data: VoiceUDPProtocolData
	} | {
		/** Undocumented: Voice protocol */
		protocol: 'webrtc'
		/** Undocumented: Same as `sdp` */
		data: string
		/** Undocumented: The call SDP */
		sdp: string
		/** Undocumented: Allowed codecs */
		codecs: Codecs
	}

/** @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-websocket-connection} */
export type VoiceReady = _DataPayload<VoiceOpcodes.Ready, VoiceReadyData>
/** @see {@link https://discord.com/developers/docs/topics/voice-connections#establishing-a-voice-websocket-connection} */
export type VoiceReadyData = {
	/** SSRC identifier */
	ssrc: number
	/** UDP IP */
	ip: string
	/** UDP port */
	port: number
	/** Supported encryption modes
	 * @see {@link https://discord.com/developers/docs/topics/voice-connections#transport-encryption-modes} */
	modes: string[]
	/** Undocumented: Audio streams */
	streams: {
		type: string
		ssrc: number
		rtx_ssrc: number
		rid: string
		quality: number
		active: boolean
	}[]
}

/** Undocumented: The WebRTC session description data is almost completely diffrent to that of UDP */
export type VoiceSessionDescription = _DataPayload<
	VoiceOpcodes.SessionDescription,
	VoiceSessionDescriptionData
>
/** Undocumented: The WebRTC session description data is almost completely diffrent to that of UDP */
export type VoiceSessionDescriptionData = {
	/** The selected DAVE protocol version
	 * @see {@link https://daveprotocol.com/#select_protocol_ack-4} */
	dave_protocol_version: number
	media_session_id: string
	video_codec: string
	audio_codec: string
	sdp: string
}
