<script lang="ts">
  /**
   * AVI preview player with circular mask, play/pause, and frame counter.
   * Renders inside the shared M3 PreviewSurface for consistent chrome.
   */
  import PreviewSurface from './m3/PreviewSurface.svelte'
  import IconButton from './m3/IconButton.svelte'

  interface Props {
    frames: ImageBitmap[]
    fps: number
    /** Accessible label for the preview canvas (e.g. pattern/effect name) */
    label?: string
    /** Callback when user stops preview */
    onstop?: () => void
  }

  let { frames, fps, label, onstop }: Props = $props()

  let canvas: HTMLCanvasElement | null = $state(null)
  let ctx: CanvasRenderingContext2D | null = null
  let playing = $state(false)
  let currentFrame = $state(0)
  let animId: number | null = null
  let counterEl: HTMLSpanElement | null = $state(null)

  // Reserve enough width for the widest "n/total" reading so the counter
  // doesn't shift when frame index changes. Computed once after mount
  // using the same tabular-nums font as the live label.
  const counterWidth = $derived.by(() => {
    if (!counterEl) return undefined
    return measureMaxCounterWidth(counterEl, frames.length)
  })

  function measureMaxCounterWidth(el: HTMLSpanElement, total: number): string | undefined {
    if (!total) return undefined
    const probe = document.createElement('span')
    probe.textContent = `${total}`
    probe.style.cssText = 'visibility:hidden;position:absolute;left:-9999px;font-variant-numeric:tabular-nums;'
    const cs = getComputedStyle(el)
    probe.style.font = cs.font
    document.body.appendChild(probe)
    const w = probe.getBoundingClientRect().width
    probe.remove()
    return `${Math.ceil(w)}px`
  }

  function getCtx(): CanvasRenderingContext2D | null {
    if (ctx) return ctx
    if (!canvas) return null
    ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
    return ctx
  }

  function drawFrame(idx: number) {
    if (!canvas || frames.length === 0) return
    const c = getCtx()
    if (!c) return
    const frame = frames[Math.min(idx, frames.length - 1)]
    c.clearRect(0, 0, canvas.width, canvas.height)
    c.drawImage(frame, 0, 0, canvas.width, canvas.height)
    // Soft circle outline as a visual cue for where a circular bezel
    // would sit, but DO NOT mask - the badge actually displays the full
    // square frame, so masking would hide content and make the preview
    // disagree with the device.
    c.strokeStyle = 'rgba(255,255,255,0.18)'
    c.lineWidth = 1
    c.beginPath()
    c.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2 - 1, 0, Math.PI * 2)
    c.stroke()
  }

  function play() {
    if (frames.length === 0) return
    playing = true
    currentFrame = 0
    let lastTime = 0
    const msPerFrame = 1000 / fps

    const loop = (time: number) => {
      if (!playing) return
      if (time - lastTime >= msPerFrame) {
        drawFrame(currentFrame)
        currentFrame = (currentFrame + 1) % frames.length
        lastTime = time
      }
      animId = requestAnimationFrame(loop)
    }
    animId = requestAnimationFrame(loop)
  }

  export function stop() {
    playing = false
    if (animId !== null) {
      cancelAnimationFrame(animId)
      animId = null
    }
    onstop?.()
  }

  function toggle() {
    if (playing) {
      stop()
    } else {
      play()
    }
  }

  /** Start playback and draw first frame. Called by parent after frames change. */
  export function startPreview() {
    if (frames.length === 0) return
    stop()
    // Wait a tick for canvas to bind
    requestAnimationFrame(() => {
      drawFrame(0)
      play()
    })
  }
</script>

{#if frames.length > 0}
  <PreviewSurface size={260}>
    <canvas
      bind:this={canvas}
      width={240}
      height={240}
      role="img"
      aria-label={label ?? 'Animation preview'}
    ></canvas>
    {#snippet controls()}
      <IconButton
        variant="tonal"
        size="sm"
        icon={playing ? 'pause' : 'play_arrow'}
        ariaLabel={playing ? 'Pause preview' : 'Play preview'}
        onclick={toggle}
      />
      <span class="text-label-md text-on-surface-variant tabular-nums">
        <span
          bind:this={counterEl}
          class="inline-block text-right tabular-nums"
          style:min-width={counterWidth}
        >{currentFrame + 1}</span>/{frames.length} @ {fps}fps
      </span>
    {/snippet}
  </PreviewSurface>
{/if}

