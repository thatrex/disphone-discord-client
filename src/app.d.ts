declare global {
	interface RTCRtpTransceiver {
		/**
		 * The read-only RTCRtpTransceiver property **`stopped`** is a boolean which indicates if the transceiver's associated sender and receiver have both been stopped.
		 *
		 * _While this property is deprecated, at this time [**`currentDirection`**](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpTransceiver/currentDirection) is never set to `"stopped"` in Firefox while this property continues to work across all browsers._
		 *
		 * @deprecated [MDN Reference](https://developer.mozilla.org/docs/Web/API/RTCRtpTransceiver/stopped)
		 */
		readonly stopped: boolean
	}
}

export {}
