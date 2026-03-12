import { Snowflake } from 'discord-api-types/globals'
import {
	GatewayOpcodes,
	GatewayHeartbeat,
	GatewayIdentify,
	GatewayRequestGuildMembers,
	GatewayRequestSoundboardSounds,
	GatewayResume,
	GatewayUpdatePresence,
	GatewayHeartbeatAck,
	GatewayHeartbeatRequest,
	GatewayHello,
	GatewayInvalidSession,
	GatewayReconnect,
	GatewayDispatchPayload,
} from 'discord-api-types/gateway'

/* 
GATEWAY
*/

export * from 'discord-api-types/gateway'
export type * from 'discord-api-types/gateway'

export type GatewaySendPayload =
	| GatewayHeartbeat
	| GatewayIdentify
	| GatewayRequestGuildMembers
	| GatewayRequestSoundboardSounds
	| GatewayResume
	| GatewayUpdatePresence
	| GatewayVoiceStateUpdate
export type GatewayReceivePayload =
	| GatewayDispatchPayload
	| GatewayHeartbeatAck
	| GatewayHeartbeatRequest
	| GatewayHello
	| GatewayInvalidSession
	| GatewayReconnect

/** @see {@link https://discord.com/developers/docs/topics/gateway-events#update-voice-state} */
export interface GatewayVoiceStateUpdate {
	op: GatewayOpcodes.VoiceStateUpdate
	d: GatewayVoiceStateUpdateData
}
/** @see {@link https://discord.com/developers/docs/topics/gateway-events#update-voice-state} */
export interface GatewayVoiceStateUpdateData {
	/** ID of the guild */
	guild_id: Snowflake
	/** ID of the voice channel client wants to join (`null` if disconnecting) */
	channel_id: Snowflake | null
	/** Is the client muted */
	self_mute: boolean
	/** Is the client deafened */
	self_deaf: boolean
	/** Undocumented: Is the client camera enable */
	self_video: boolean
	/** Undocumented */
	flags: number
}
