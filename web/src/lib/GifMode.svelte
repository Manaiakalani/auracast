<script lang="ts">
  /**
   * GIF upload mode - decode animated GIF frame-by-frame, crop to circle,
   * encode as MJPEG AVI for the badge.
   */
  import { buildMjpgAvi } from '../avi-builder'
  import { SIZE, HALF, RADIUS, TAU } from '../patterns/helpers'
  import { encodeJpeg } from './jpeg-encoder-client'
  import { fitJpegFramesToBudget, MAX_UPLOAD_BYTES, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT } from './image-processing'
  import { formatBytes } from './utils'
  import Button from './m3/Button.svelte'

  interface Props {
    onResult: (avi: Uint8Array, fps: number) => void
    busy: boolean
    isWriting: boolean
  }

  let { onResult, busy = $bindable(false), isWriting }: Props = $props()

  let fileInput: HTMLInputElement | null = $state(null)
  let dragOver = $state(false)
  let status = $state('')
  let frameCount = $state(0)
  let detectedFps = $state(0)
  let outputSize = $state('')
  let errorMsg = $state('')

  function handleDrop(e: DragEvent): void {
    e.preventDefault()
    dragOver = false
    const file = e.dataTransfer?.files[0]
    if (file && file.type === 'image/gif') processGif(file)
    else errorMsg = 'Please drop an animated GIF file.'
  }

  function handleFileSelect(e: Event): void {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) processGif(file)
    input.value = ''
  }

  async function processGif(file: File): Promise<void> {
    busy = true
    errorMsg = ''
    status = 'Decoding GIF frames...'
    frameCount = 0
    detectedFps = 0
    outputSize = ''

    try {
      const frames = await decodeGifFrames(file)
      if (frames.jpegFrames.length === 0) throw new Error('No frames found in GIF.')

      frameCount = frames.jpegFrames.length
      detectedFps = frames.fps
      status = `Encoding ${frameCount} frames @ ${frames.fps} fps...`

      // Fit frames to budget
      const fitted = await fitJpegFramesToBudget(
        frames.jpegFrames,
        E87_IMAGE_WIDTH,
        E87_IMAGE_HEIGHT,
        MAX_UPLOAD_BYTES,
      )

      const avi = buildMjpgAvi(fitted.frames, { fps: frames.fps })
      outputSize = formatBytes(avi.length)

      if (!fitted.fits) {
        status = `Warning: AVI is ${outputSize}, may exceed badge limit.`
      } else {
        status = `Ready: ${frameCount} frames @ ${frames.fps} fps, ${outputSize}`
      }

      onResult(avi, frames.fps)
    } catch (err) {
      errorMsg = (err as Error).message
      status = ''
    } finally {
      busy = false
    }
  }

  interface DecodedGif {
    jpegFrames: Uint8Array[]
    fps: number
  }

  async function decodeGifFrames(file: File): Promise<DecodedGif> {
    const canvas = new OffscreenCanvas(E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!

    // Use ImageDecoder API (Chrome/Edge - the only browsers with Web Bluetooth)
    if ('ImageDecoder' in globalThis) {
      return decodeWithImageDecoder(file, canvas, ctx)
    }

    // Fallback: decode via img element + createImageBitmap (unlikely path)
    return decodeWithImageBitmap(file, canvas, ctx)
  }

  async function decodeWithImageDecoder(
    file: File,
    canvas: OffscreenCanvas,
    ctx: OffscreenCanvasRenderingContext2D,
  ): Promise<DecodedGif> {
    const objectUrl = URL.createObjectURL(file)
    try {
      const response = await fetch(objectUrl)
      const decoder = new ImageDecoder({ data: response.body!, type: 'image/gif' })
      try {
        await decoder.completed

        const track = decoder.tracks.selectedTrack!
        const totalFrames = track.frameCount
        const jpegFrames: Uint8Array[] = []
        let totalDurationUs = 0

        for (let i = 0; i < totalFrames; i++) {
          const result = await decoder.decode({ frameIndex: i })
          const vf = result.image
          try {
            totalDurationUs += vf.duration ?? 100_000

            // Draw frame to canvas with circular mask
            ctx.clearRect(0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
            ctx.fillStyle = '#000'
            ctx.fillRect(0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
            ctx.save()
            ctx.beginPath()
            ctx.arc(HALF, HALF, RADIUS, 0, TAU)
            ctx.clip()
            ctx.drawImage(vf, 0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
            ctx.restore()

            // Apply circular mask (black outside circle)
            ctx.globalCompositeOperation = 'destination-in'
            ctx.beginPath()
            ctx.arc(HALF, HALF, RADIUS, 0, TAU)
            ctx.fill()
            ctx.globalCompositeOperation = 'source-over'

            const imgData = ctx.getImageData(0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
            const jpeg = await encodeJpeg(
              E87_IMAGE_WIDTH,
              E87_IMAGE_HEIGHT,
              new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength),
              85,
            )
            jpegFrames.push(jpeg)
          } finally {
            vf.close()
          }
        }

        // Average frame duration -> fps, clamped 1-30
        const avgDurationMs = (totalDurationUs / totalFrames) / 1000
        const fps = Math.max(1, Math.min(30, Math.round(1000 / avgDurationMs)))

        return { jpegFrames, fps }
      } finally {
        decoder.close()
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  async function decodeWithImageBitmap(
    file: File,
    canvas: OffscreenCanvas,
    ctx: OffscreenCanvasRenderingContext2D,
  ): Promise<DecodedGif> {
    // Simple fallback: treat as single-frame image
    const bitmap = await createImageBitmap(file, {
      resizeWidth: E87_IMAGE_WIDTH,
      resizeHeight: E87_IMAGE_HEIGHT,
    })

    ctx.clearRect(0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
    ctx.save()
    ctx.beginPath()
    ctx.arc(HALF, HALF, RADIUS, 0, TAU)
    ctx.clip()
    ctx.drawImage(bitmap, 0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
    ctx.restore()

    ctx.globalCompositeOperation = 'destination-in'
    ctx.beginPath()
    ctx.arc(HALF, HALF, RADIUS, 0, TAU)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'

    const imgData = ctx.getImageData(0, 0, E87_IMAGE_WIDTH, E87_IMAGE_HEIGHT)
    const jpeg = await encodeJpeg(
      E87_IMAGE_WIDTH,
      E87_IMAGE_HEIGHT,
      new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength),
      85,
    )
    bitmap.close()
    return { jpegFrames: [jpeg], fps: 10 }
  }
</script>

<div class="flex flex-col gap-5">
  <!-- Drop zone -->
  <div
    class="drop-zone"
    class:drag-over={dragOver}
    role="button"
    tabindex="0"
    ondragover={(e) => { e.preventDefault(); dragOver = true }}
    ondragleave={() => { dragOver = false }}
    ondrop={handleDrop}
    onclick={() => fileInput?.click()}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput?.click() }}
  >
    <span class="material-symbols-outlined text-[40px] opacity-70">gif_box</span>
    {#if busy}
      <span class="text-label-md font-medium">Processing...</span>
    {:else}
      <span class="text-label-md font-medium">Drop GIF here or click to browse</span>
    {/if}
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept="image/gif"
    onchange={handleFileSelect}
    disabled={isWriting || busy}
    class="sr-only"
  />

  <Button
    variant="tonal"
    size="md"
    icon="gif_box"
    disabled={isWriting || busy}
    onclick={() => fileInput?.click()}
  >
    Select GIF file...
  </Button>

  {#if status}
    <p class="text-body-sm text-on-surface-variant m-0">{status}</p>
  {/if}

  {#if frameCount > 0}
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-on-surface-variant">
      <span>Frames: <span class="tabular text-on-surface">{frameCount}</span></span>
      <span>FPS: <span class="tabular text-on-surface">{detectedFps}</span></span>
      {#if outputSize}
        <span>Size: <span class="tabular text-on-surface">{outputSize}</span></span>
      {/if}
    </div>
  {/if}

  {#if errorMsg}
    <p class="text-body-sm text-error m-0">{errorMsg}</p>
  {/if}
</div>

<style>
  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    border: 2px dashed var(--md-sys-color-outline-variant, #79747e);
    border-radius: 1rem;
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;
    color: var(--md-sys-color-on-surface-variant, #49454f);
  }
  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: var(--md-sys-color-primary, #6750a4);
    background-color: color-mix(in srgb, var(--md-sys-color-primary, #6750a4) 8%, transparent);
  }
</style>
