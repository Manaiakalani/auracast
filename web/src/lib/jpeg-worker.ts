/**
 * JPEG encoder Web Worker.
 * (header doc continues below the polyfill)
 */
// jpeg-js requires Node's Buffer at runtime. The main thread polyfills it
// in main.ts; workers run in a separate global, so we polyfill again here.
import { Buffer } from 'buffer'
;(self as unknown as { Buffer: typeof Buffer }).Buffer = Buffer

import { encode as jpegJsEncode } from 'jpeg-js'

interface EncodeRequest {
  id: number
  width: number
  height: number
  buf: ArrayBuffer
  quality: number
}

interface EncodeResponse {
  id: number
  ok: true
  buf: ArrayBuffer
}

interface EncodeError {
  id: number
  ok: false
  error: string
}

self.onmessage = (e: MessageEvent<EncodeRequest>) => {
  const { id, width, height, buf, quality } = e.data
  try {
    const data = new Uint8Array(buf)
    // jpeg-js's TS types insist on Buffer; the runtime contract is "anything
    // with .length and indexed byte access", which Uint8Array satisfies.
    const enc = jpegJsEncode(
      { width, height, data: data as unknown as Buffer },
      quality,
    )
    const out = new Uint8Array(enc.data.byteLength)
    out.set(new Uint8Array(enc.data.buffer, enc.data.byteOffset, enc.data.byteLength))
    const resp: EncodeResponse = { id, ok: true, buf: out.buffer }
    ;(self as unknown as Worker).postMessage(resp, [out.buffer])
  } catch (err) {
    const resp: EncodeError = { id, ok: false, error: (err as Error).message }
    ;(self as unknown as Worker).postMessage(resp)
  }
}
