/**
 * Pattern generation Web Worker.
 *
 * Runs pattern generators off the main thread so the UI stays responsive.
 * Each generator renders frames on OffscreenCanvas and encodes to JPEG
 * (via the jpeg-encoder-client, which either spawns a nested worker or
 * falls back to sync encoding - both are fine since we're already off
 * the main thread).
 *
 * Protocol:
 *   Main → Worker:
 *     { type: 'generate', jobId: number, patternId: string, frames: number, fps: number }
 *     { type: 'cancel', jobId: number }
 *
 *   Worker → Main:
 *     { type: 'frame', jobId: number, index: number, jpeg: ArrayBuffer }
 *     { type: 'done',  jobId: number, totalFrames: number }
 *     { type: 'error', jobId: number, message: string }
 */

// Buffer polyfill needed for jpeg-js (same as jpeg-worker.ts)
import { Buffer } from 'buffer'
;(self as unknown as { Buffer: typeof Buffer }).Buffer = Buffer

import { GENERATORS } from '../patterns/index'

const cancelled = new Set<number>()

interface GenerateMsg {
  type: 'generate'
  jobId: number
  patternId: string
  frames: number
  fps: number
}

interface CancelMsg {
  type: 'cancel'
  jobId: number
}

type InMsg = GenerateMsg | CancelMsg

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data
  if (msg.type === 'cancel') {
    cancelled.add(msg.jobId)
    return
  }

  if (msg.type === 'generate') {
    void runGenerate(msg)
  }
}

async function runGenerate(msg: GenerateMsg) {
  const { jobId, patternId, frames, fps } = msg
  const gen = GENERATORS[patternId]
  if (!gen) {
    post({ type: 'error', jobId, message: `Unknown pattern: ${patternId}` })
    return
  }

  try {
    // The generator returns all frames at once. We post each frame
    // individually for progressive preview support.
    const jpegs = await gen({ frames, fps })

    for (let i = 0; i < jpegs.length; i++) {
      if (cancelled.has(jobId)) {
        cancelled.delete(jobId)
        return // silently stop - main thread already moved on
      }
      const jpeg = jpegs[i]
      const buf = jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength)
      post({ type: 'frame', jobId, index: i, jpeg: buf }, [buf])
    }

    if (!cancelled.has(jobId)) {
      post({ type: 'done', jobId, totalFrames: jpegs.length })
    }
    cancelled.delete(jobId)
  } catch (err) {
    if (!cancelled.has(jobId)) {
      post({ type: 'error', jobId, message: (err as Error).message })
    }
    cancelled.delete(jobId)
  }
}

function post(msg: unknown, transfer?: Transferable[]) {
  ;(self as unknown as Worker).postMessage(msg, transfer ? { transfer } : undefined)
}
