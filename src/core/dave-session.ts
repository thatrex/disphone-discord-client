import EventEmitter from 'eventemitter3'
import { DaveSession as Davey } from '@snazzah/davey'

export const SILENCE_FRAME = [0xf8, 0xff, 0xfe] // opus 'silent' frame

export interface DaveSession extends EventEmitter {
	on(event: '', listener: () => void): this
	on(event: '', listener: () => void): this
	emit(event: ''): boolean
	emit(event: ''): boolean
}

export class DaveSession extends EventEmitter {
	constructor() {
		super()
	}
}
