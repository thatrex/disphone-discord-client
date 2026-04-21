import EventEmitter from 'eventemitter3'
import { LogLevel } from '@/types/common'

export interface DaveSession extends EventEmitter {
	emit(event: LogLevel, ...data: any[]): boolean
	on(event: LogLevel, listener: (data: any[]) => void): this

	on(event: 'key-package', listener: (message: ArrayBuffer) => void): this
	emit(event: 'key-package', message: ArrayBuffer): boolean

	on(event: 'invalidate-transition', listener: (transition_id: number) => void): this
	emit(event: 'invalidate-transition', transition_id: number): boolean
}

export class DaveSession extends EventEmitter {
	constructor() {
		super()
	}
}
