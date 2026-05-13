/**
 * Procedural pattern generators for E87/L8 circular LED badge (368×368).
 *
 * LOOPING CONTRACT: Every pattern uses `phase = f / frames` as a 0→1
 * normalized cycle.  Frame 0 and the (hypothetical) frame N must look
 * identical so the device plays a seamless loop at any frame-count/fps.
 */

export const SIZE = 368
export const HALF = SIZE / 2
export const RADIUS = HALF - 2
export const TAU = Math.PI * 2

import type { PatternOptions } from '../pattern-meta'
export type { PatternOptions }

// ─── Helpers ───

export function createCanvas(): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const canvas = new OffscreenCanvas(SIZE, SIZE)
  // willReadFrequently hints the browser to allocate a software-readable
  // backing store, since toJpeg() calls getImageData() once per frame.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  return [canvas, ctx]
}

export function clear(ctx: OffscreenCanvasRenderingContext2D, bg = '#000') {
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)
}

export function circularMask(ctx: OffscreenCanvasRenderingContext2D) {
  ctx.globalCompositeOperation = 'destination-in'
  ctx.beginPath()
  ctx.arc(HALF, HALF, RADIUS, 0, TAU)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

import { encodeJpeg } from '../lib/jpeg-encoder-client'

/**
 * Encode an OffscreenCanvas to JPEG via the JPEG worker (with synchronous
 * fallback). jpeg-js is used over the browser's native canvas encoder
 * because the Jieli SoC's MJPEG decoder can't parse Chromium's optimized
 * Huffman tables - that decoder bug renders only the first ~3 pixel-rows
 * on the badge regardless of frame content. jpeg-js's tables are
 * bit-for-bit standard (matching what PIL/Zrun produce), so the badge
 * decodes them correctly. The worker offloads encoding off the main
 * thread so the UI stays responsive during pattern generation.
 *
 * We also avoid Chromium's APP2 ICC color-profile injection this way.
 */
export async function toJpeg(canvas: OffscreenCanvas, quality = 0.9): Promise<Uint8Array> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return encodeJpeg(
    canvas.width,
    canvas.height,
    new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength),
    Math.max(1, Math.min(100, Math.round(quality * 100))),
  )
}

/** Attempt to freeze a seeded PRNG state for reproducibility. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
