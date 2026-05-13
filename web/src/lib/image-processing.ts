/**
 * Live preview & still-image processing pipeline for the E87/L8 badge.
 *
 * Provides:
 *  - canvasToBadgeJpeg: JPEG encode that uses jpeg-js's standard Huffman
 *    tables (the badge SoC mis-renders Chromium's optimised tables).
 *  - imageFile/video → 512×512 ImageBitmap helpers used to populate the
 *    live preview canvas without re-decoding source files on each frame.
 *  - previewBitmap{,s}ToJpeg/Avi: encode cached preview bitmaps into the
 *    final 368×368 JPEG / MJPEG AVI uploaded to the badge.
 *  - fitJpegFramesToBudget: bracket JPEG quality across all frames to land
 *    a multi-frame AVI under MAX_UPLOAD_BYTES.
 */

import { encode as jpegJsEncode } from 'jpeg-js'
import { buildMjpgAvi, sanitizeJpegForBadge } from '../avi-builder'
import { formatBytes } from './utils'

/**
 * Encode a canvas to JPEG using jpeg-js's standard Huffman tables - the
 * Jieli SoC's MJPEG decoder mis-renders Chromium's image-optimized tables
 * (only the first ~3 pixel rows decode). Use this everywhere we'd
 * otherwise call `canvas.convertToBlob({type:'image/jpeg'})`.
 */
export function canvasToBadgeJpeg(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  quality = 0.88,
): Uint8Array {
  const ctx = (canvas as OffscreenCanvas).getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null
  if (!ctx) throw new Error('canvasToBadgeJpeg: no 2D context')
  const w = canvas.width
  const h = canvas.height
  const img = ctx.getImageData(0, 0, w, h)
  const enc = jpegJsEncode(
    { width: w, height: h, data: img.data as unknown as Buffer },
    Math.max(1, Math.min(100, Math.round(quality * 100))),
  )
  return new Uint8Array(enc.data.buffer, enc.data.byteOffset, enc.data.byteLength)
}

export const E87_IMAGE_WIDTH = 368
export const E87_IMAGE_HEIGHT = 368
// Single-slot upload cap. The badge's flash has ~970 KB available per
// gallery slot. The server pins every upload to a fixed filename so each
// send overwrites the same slot (otherwise unique random filenames would
// fill flash cumulatively after a few sends and reject everything).
// 900 KB leaves headroom for protocol/AVI overhead.
export const MAX_UPLOAD_BYTES = 900_000
export const LIVE_PREVIEW_SIZE = 512

export interface TransformSettings {
  scale: number
  panX: number
  panY: number
  backdropColor?: string
}

export interface OutputFrameSize {
  width: number
  height: number
}

const DEFAULT_TRANSFORM: TransformSettings = {
  scale: 1,
  panX: 0,
  panY: 0,
}

function cropToSquare(bitmap: ImageBitmap): { sx: number, sy: number, sw: number, sh: number } {
  const srcRatio = bitmap.width / bitmap.height
  const targetRatio = 1
  let sx = 0
  let sy = 0
  let sw = bitmap.width
  let sh = bitmap.height
  if (srcRatio > targetRatio) {
    sw = Math.round(bitmap.height * targetRatio)
    sx = Math.floor((bitmap.width - sw) / 2)
  } else {
    sh = Math.round(bitmap.width / targetRatio)
    sy = Math.floor((bitmap.height - sh) / 2)
  }
  return { sx, sy, sw, sh }
}

function renderTransformedFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  transform: TransformSettings,
): void {
  const { scale, panX, panY } = transform
  const drawW = width * scale
  const drawH = height * scale
  const dx = (width - drawW) / 2 + panX * (width / 2)
  const dy = (height - drawH) / 2 + panY * (height / 2)

  ctx.fillStyle = transform.backdropColor ?? 'black'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, dx, dy, drawW, drawH)
}

async function squareBitmapToJpeg(
  bitmap: ImageBitmap,
  transform: TransformSettings,
  quality = 0.88,
  outputSize: OutputFrameSize = { width: E87_IMAGE_WIDTH, height: E87_IMAGE_HEIGHT },
): Promise<Uint8Array> {
  const width = Math.max(1, Math.round(outputSize.width))
  const height = Math.max(1, Math.round(outputSize.height))
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create 2D canvas context.')

  renderTransformedFrame(ctx, bitmap, width, height, transform)
  return canvasToBadgeJpeg(canvas, quality)
}

/**
 * Re-encode a list of JPEG frames at progressively lower quality until
 * the resulting AVI would fit under `maxBytes` (default `MAX_UPLOAD_BYTES`).
 *
 * AVI overhead = ~6 KB header + 24 bytes per frame (chunk header + idx1 entry).
 * Returns the smallest-quality batch that fits, or the lowest-quality batch
 * we attempted if even q=0.25 is too big (caller should warn the user).
 */
export async function fitJpegFramesToBudget(
  frames: Uint8Array[],
  width: number,
  height: number,
  maxBytes: number = MAX_UPLOAD_BYTES,
  log?: (msg: string) => void,
): Promise<{ frames: Uint8Array[], quality: number, totalBytes: number, fits: boolean }> {
  const aviOverhead = 6000 + frames.length * 24
  const budget = Math.max(0, maxBytes - aviOverhead)
  const currentTotal = frames.reduce((s, f) => s + f.length, 0)
  if (currentTotal <= budget) {
    return { frames, quality: 1, totalBytes: currentTotal, fits: true }
  }

  // Decode once into bitmaps so we can re-encode at multiple qualities cheaply.
  const bitmaps: ImageBitmap[] = []
  try {
    for (const jpeg of frames) {
      // No need to wrap in a fresh Uint8Array - Blob copies the bytes itself.
      const blob = new Blob([jpeg as BlobPart], { type: 'image/jpeg' })
      bitmaps.push(await createImageBitmap(blob))
    }

    const qualitySteps = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25]
    // Reuse one canvas + context for the entire quality search instead of
    // allocating ~7 × N canvases. For a 120-frame video that's 840 fewer
    // allocations.
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')!
    let best: { frames: Uint8Array[], quality: number, totalBytes: number } | null = null

    for (const q of qualitySteps) {
      const out: Uint8Array[] = []
      let total = 0
      for (const bm of bitmaps) {
        ctx.fillStyle = 'black'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(bm, 0, 0, width, height)
        const bytes = canvasToBadgeJpeg(canvas, q)
        out.push(bytes)
        total += bytes.length
      }
      best = { frames: out, quality: q, totalBytes: total }
      log?.(`  Re-encoded at quality ${q.toFixed(2)} → ${formatBytes(total)} (budget ${formatBytes(budget)})`)
      if (total <= budget) {
        return { ...best, fits: true }
      }
    }

    return { ...best!, fits: false }
  } finally {
    for (const bm of bitmaps) bm.close()
  }
}

/**
 * Convert a single image file to a 512×512 (or `size`) ImageBitmap suitable
 * for the live preview canvas. Center-cropped to a square.
 */
export async function imageFileToPreviewBitmap(file: File, size = LIVE_PREVIEW_SIZE): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file)
  const { sx, sy, sw, sh } = cropToSquare(bitmap)
  const canvas = new OffscreenCanvas(size, size)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create 2D canvas context.')
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, size, size)
  bitmap.close()
  return createImageBitmap(canvas)
}

export async function imagesToPreviewBitmaps(files: File[], size = LIVE_PREVIEW_SIZE): Promise<ImageBitmap[]> {
  const out: ImageBitmap[] = []
  for (const file of files) {
    out.push(await imageFileToPreviewBitmap(file, size))
  }
  return out
}

export async function previewBitmapToJpeg(
  bitmap: ImageBitmap,
  transform: TransformSettings = DEFAULT_TRANSFORM,
  outputSize: OutputFrameSize = { width: E87_IMAGE_WIDTH, height: E87_IMAGE_HEIGHT },
): Promise<Uint8Array> {
  return squareBitmapToJpeg(bitmap, transform, 0.88, outputSize)
}

export async function previewBitmapsToAvi(
  bitmaps: ImageBitmap[],
  fps: number,
  transform: TransformSettings = DEFAULT_TRANSFORM,
  log?: (msg: string) => void,
  outputSize: OutputFrameSize = { width: E87_IMAGE_WIDTH, height: E87_IMAGE_HEIGHT },
): Promise<Uint8Array> {
  if (bitmaps.length === 0) throw new Error('No frames to encode.')
  log?.(`Encoding ${bitmaps.length} cached frames to AVI...`)
  const frames: Uint8Array[] = []
  for (let i = 0; i < bitmaps.length; i++) {
    frames.push(await squareBitmapToJpeg(bitmaps[i], transform, 0.88, outputSize))
    if ((i + 1) % 25 === 0) log?.(`  Encoded ${i + 1}/${bitmaps.length} frames...`)
  }
  const avi = buildMjpgAvi(frames, { fps })
  log?.(`AVI built from cache: ${formatBytes(avi.length)}`)
  return avi
}

export interface VideoToPreviewFramesOptions {
  fps: number
  trimStart: number
  trimEnd: number
  maxFrames?: number
  previewSize?: number
}

export async function videoToPreviewBitmaps(
  file: File,
  opts: VideoToPreviewFramesOptions,
  log?: (msg: string) => void,
): Promise<ImageBitmap[]> {
  const {
    fps,
    trimStart,
    trimEnd,
    maxFrames,
    previewSize = LIVE_PREVIEW_SIZE,
  } = opts

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('Failed to load video'))
    video.src = url
  })

  const start = Math.max(0, trimStart)
  const end = Math.max(start, trimEnd)
  const duration = Math.max(0, end - start)
  const requestedFps = Math.max(1, fps)
  const expectedFrames = Math.ceil(duration * requestedFps)
  const targetFrames = Math.max(1, maxFrames ? Math.min(expectedFrames, maxFrames) : expectedFrames)
  const step = targetFrames <= 1 ? 0 : duration / (targetFrames - 1)
  log?.(`Extracting ${targetFrames} cached preview frames at ${requestedFps}fps...`)

  const canvas = new OffscreenCanvas(previewSize, previewSize)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create 2D canvas context.')

  const srcFullW = video.videoWidth
  const srcFullH = video.videoHeight
  const minDim = Math.min(srcFullW, srcFullH)
  const cropX = (srcFullW - minDim) / 2
  const cropY = (srcFullH - minDim) / 2

  const frames: ImageBitmap[] = []
  const progressStep = Math.max(1, Math.floor(targetFrames / 20))
  for (let i = 0; i < targetFrames; i++) {
    const t = Math.min(end, start + i * step)
    video.currentTime = t
    await new Promise<void>((r) => { video.onseeked = () => r() })

    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, previewSize, previewSize)
    ctx.drawImage(video, cropX, cropY, minDim, minDim, 0, 0, previewSize, previewSize)
    frames.push(await createImageBitmap(canvas))

    if ((i + 1) % progressStep === 0 || i + 1 === targetFrames) {
      const percent = Math.round(((i + 1) / targetFrames) * 100)
      log?.(`  Cached ${i + 1}/${targetFrames} frames (${percent}%)...`)
    }
  }

  URL.revokeObjectURL(url)
  return frames
}
