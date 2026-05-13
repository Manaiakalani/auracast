<script module lang="ts">
  // Module-level concurrency limiter shared across all PatternThumb instances.
  const MAX_CONCURRENT = 2
  let _active = 0
  const _queue: (() => void)[] = []

  function acquireSlot(): Promise<void> {
    if (_active < MAX_CONCURRENT) {
      _active++
      return Promise.resolve()
    }
    return new Promise<void>(resolve => _queue.push(resolve))
  }

  function releaseSlot() {
    const next = _queue.shift()
    if (next) {
      next()
    } else {
      _active--
    }
  }
</script>

<script lang="ts">
  /**
   * Animated pattern thumbnail. Generates 4 tiny frames when the card
   * enters the viewport (IntersectionObserver) and cycles them in a
   * simple interval. Renders at full 368px then scales to 48x48 via
   * CSS (generators use absolute pixel math).
   *
   * Uses a global concurrency limiter so at most 2 thumbnails generate
   * at a time, preventing main-thread stalls on initial load.
   */
  import type { PatternDef } from '../pattern-generators'
  import { generatePatternInWorker, PatternCancelledError } from './pattern-worker-client'
  import type { GenerateHandle } from './pattern-worker-client'

  interface Props {
    pattern: PatternDef
    animate: boolean
  }

  let { pattern, animate }: Props = $props()

  let canvas: HTMLCanvasElement | null = $state(null)
  let ctx: CanvasRenderingContext2D | null = null
  let frames: ImageBitmap[] = $state([])
  let currentFrame = 0
  let interval: ReturnType<typeof setInterval> | null = null
  let genState: 'idle' | 'pending' | 'done' | 'failed' = $state('idle')
  let activeHandle: GenerateHandle | null = null

  function ensureCtx(): CanvasRenderingContext2D | null {
    if (ctx) return ctx
    if (!canvas) return null
    ctx = canvas.getContext('2d', { alpha: false })
    return ctx
  }

  function drawFrame(idx: number) {
    const c = ensureCtx()
    if (!c || frames.length === 0) return
    c.drawImage(frames[idx % frames.length], 0, 0, 48, 48)
  }

  function startAnimation() {
    if (interval || frames.length <= 1) return
    interval = setInterval(() => {
      currentFrame = (currentFrame + 1) % frames.length
      drawFrame(currentFrame)
    }, 250)
  }

  function stopAnimation() {
    if (interval) {
      clearInterval(interval)
      interval = null
    }
  }

  function cancelGeneration() {
    if (activeHandle) {
      activeHandle.cancel()
      activeHandle = null
    }
  }

  async function generate() {
    if (genState === 'pending' || genState === 'done') return
    genState = 'pending'
    await acquireSlot()
    try {
      const handle = generatePatternInWorker(pattern.generatorKey, { frames: 4, fps: 4 })
      activeHandle = handle
      const jpegs = await handle.result
      activeHandle = null
      const bitmaps = await Promise.all(
        jpegs.map(j => createImageBitmap(new Blob([j.buffer.slice(j.byteOffset, j.byteOffset + j.byteLength)], { type: 'image/jpeg' })))
      )
      frames = bitmaps
      genState = 'done'
      drawFrame(0)
      if (animate) startAnimation()
    } catch (e) {
      activeHandle = null
      if (e instanceof PatternCancelledError) {
        genState = 'idle'
      } else {
        genState = 'failed'
      }
    } finally {
      releaseSlot()
    }
  }

  // Start/stop animation when the animate prop changes.
  $effect(() => {
    if (animate && frames.length > 1) {
      startAnimation()
    } else {
      stopAnimation()
    }
  })

  // IntersectionObserver to trigger generation when visible
  $effect(() => {
    if (!canvas || !animate) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void generate()
            observer.disconnect()
          }
        }
      },
      { rootMargin: '100px' }
    )
    observer.observe(canvas)
    return () => {
      observer.disconnect()
      stopAnimation()
      cancelGeneration()
    }
  })
</script>

<canvas
  bind:this={canvas}
  width={48}
  height={48}
  class="w-10 h-10 rounded-md {frames.length > 0 && animate ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300"
  aria-hidden="true"
></canvas>
