/**
 * Thin client for the JPEG encoder Web Worker.
 *
 * Lazy-instantiates a single worker on first use, multiplexes encode jobs
 * by numeric id, and falls back to a synchronous main-thread encode if the
 * worker fails to start (e.g. CSP, file:// preview, very old browser).
 *
 * The fallback path is intentionally byte-identical to the worker path:
 * both call `jpegJsEncode` with the same arguments, so the pattern audit
 * baseline holds in either mode.
 */
import { encode as jpegJsEncode } from 'jpeg-js'

interface PendingJob {
  resolve: (out: Uint8Array) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let workerFailed = false
let nextId = 1
const pending = new Map<number, PendingJob>()

function tryGetWorker(): Worker | null {
  if (workerFailed) return null
  if (worker) return worker
  if (typeof Worker === 'undefined') {
    workerFailed = true
    return null
  }
  try {
    worker = new Worker(new URL('./jpeg-worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; buf?: ArrayBuffer; error?: string }>) => {
      const { id, ok, buf, error } = e.data
      const job = pending.get(id)
      if (!job) return
      pending.delete(id)
      if (ok && buf) job.resolve(new Uint8Array(buf))
      else job.reject(new Error(error || 'worker encode failed'))
    }
    worker.onerror = (e) => {
      // A worker-level error is fatal: reject every in-flight job and force
      // future calls to use the synchronous fallback path.
      const msg = e.message || 'worker error'
      for (const job of pending.values()) job.reject(new Error(msg))
      pending.clear()
      workerFailed = true
      worker?.terminate()
      worker = null
    }
    return worker
  } catch {
    workerFailed = true
    return null
  }
}

function encodeSync(width: number, height: number, data: Uint8Array, quality: number): Uint8Array {
  const enc = jpegJsEncode(
    { width, height, data: data as unknown as Buffer },
    quality,
  )
  return new Uint8Array(enc.data.buffer, enc.data.byteOffset, enc.data.byteLength)
}

/**
 * Encode an RGBA pixel buffer to JPEG. Quality is the jpeg-js scale (1-100),
 * not the 0-1 canvas convention; callers handle the conversion.
 *
 * The input buffer is consumed (transferred to the worker) on the worker
 * path. Callers must not retain a reference to it after calling.
 */
export function encodeJpeg(
  width: number,
  height: number,
  data: Uint8Array,
  quality: number,
): Promise<Uint8Array> {
  const w = tryGetWorker()
  if (!w) {
    // Synchronous fallback. Wrap in a Promise so callers can stay async.
    return Promise.resolve(encodeSync(width, height, data, quality))
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    // Copy into a fresh ArrayBuffer so we can transfer ownership cleanly
    // without invalidating the caller's source buffer (which may be backed
    // by a canvas-owned ImageData.data and would throw on transfer).
    const owned = new Uint8Array(data.byteLength)
    owned.set(data)
    w.postMessage({ id, width, height, buf: owned.buffer, quality }, [owned.buffer])
  })
}
