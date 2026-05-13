/**
 * Main-thread client for the pattern generation worker.
 *
 * Wraps the worker protocol in a promise-based API with optional
 * progressive frame callback and cancellation support.
 */

/** Sentinel error for cancelled jobs (not a real failure). */
export class PatternCancelledError extends Error {
  constructor() { super('Pattern generation cancelled') }
}

interface PatternJob {
  resolve: (frames: Uint8Array[]) => void
  reject: (err: Error) => void
  frames: Uint8Array[]
  onFrame?: (index: number, jpeg: Uint8Array) => void
}

let worker: Worker | null = null
let workerFailCount = 0
const MAX_WORKER_RETRIES = 3
let nextJobId = 1
const jobs = new Map<number, PatternJob>()

function getWorker(): Worker | null {
  if (workerFailCount >= MAX_WORKER_RETRIES) return null
  if (worker) return worker
  if (typeof Worker === 'undefined') {
    workerFailCount = MAX_WORKER_RETRIES
    return null
  }
  try {
    worker = new Worker(new URL('./pattern-worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      const job = jobs.get(msg.jobId)
      if (!job) return

      if (msg.type === 'frame') {
        const jpeg = new Uint8Array(msg.jpeg as ArrayBuffer)
        job.frames[msg.index] = jpeg
        job.onFrame?.(msg.index, jpeg)
      } else if (msg.type === 'done') {
        jobs.delete(msg.jobId)
        job.resolve(job.frames)
      } else if (msg.type === 'error') {
        jobs.delete(msg.jobId)
        job.reject(new Error(msg.message))
      }
    }
    worker.onerror = (e) => {
      const msg = e.message || 'pattern worker error'
      for (const job of jobs.values()) job.reject(new Error(msg))
      jobs.clear()
      workerFailCount++
      worker?.terminate()
      worker = null
    }
    return worker
  } catch {
    workerFailCount++
    return null
  }
}

export interface GenerateOptions {
  frames: number
  fps: number
  /** Called as each frame arrives (for progressive preview). */
  onFrame?: (index: number, jpeg: Uint8Array) => void
}

export interface GenerateHandle {
  /** Resolves when all frames are generated. Rejects with PatternCancelledError on cancel. */
  result: Promise<Uint8Array[]>
  /** Cancel the in-flight job. The promise rejects with PatternCancelledError. */
  cancel: () => void
}

/**
 * Generate a pattern off the main thread.
 *
 * Returns a handle with a result promise and a cancel function.
 * If the worker fails to start, falls back to main-thread generation.
 */
export function generatePatternInWorker(
  patternId: string,
  opts: GenerateOptions,
): GenerateHandle {
  const w = getWorker()
  const jobId = nextJobId++

  if (!w) {
    // Fallback: generate on main thread
    let cancelled = false
    let rejectFn: ((err: Error) => void) | null = null
    const result = new Promise<Uint8Array[]>((resolve, reject) => {
      rejectFn = reject
      ;(async () => {
        const { GENERATORS } = await import('../patterns/index')
        const gen = GENERATORS[patternId]
        if (!gen) throw new Error(`Unknown pattern: ${patternId}`)
        const jpegs = await gen({ frames: opts.frames, fps: opts.fps })
        if (cancelled) return
        for (let i = 0; i < jpegs.length; i++) {
          opts.onFrame?.(i, jpegs[i])
        }
        resolve(jpegs)
      })().catch(reject)
    })
    return {
      result,
      cancel: () => {
        cancelled = true
        rejectFn?.(new PatternCancelledError())
      },
    }
  }

  const frames = new Array<Uint8Array>(opts.frames)
  const result = new Promise<Uint8Array[]>((resolve, reject) => {
    jobs.set(jobId, { resolve, reject, frames, onFrame: opts.onFrame })
  })

  w.postMessage({ type: 'generate', jobId, patternId, frames: opts.frames, fps: opts.fps })

  return {
    result,
    cancel: () => {
      const job = jobs.get(jobId)
      jobs.delete(jobId)
      w.postMessage({ type: 'cancel', jobId })
      job?.reject(new PatternCancelledError())
    },
  }
}
