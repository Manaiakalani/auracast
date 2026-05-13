<script lang="ts">
  /**
   * Pattern generator mode - grid of pattern cards, frames/fps settings,
   * Apple-style Still / Video toggle, preview.
   */
  import { PATTERNS, type PatternDef } from '../pattern-generators'
  import { MAX_UPLOAD_BYTES } from './image-processing'
  import FrameRateControls from './FrameRateControls.svelte'
  import PatternThumb from './PatternThumb.svelte'
  // Debug hook for the Playwright pattern audit harness
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __AURACAST_PATTERNS__: PatternDef[] }).__AURACAST_PATTERNS__ = PATTERNS
  }

  interface Props {
    isWriting: boolean
    isGeneratingPreview: boolean
    isGeneratingPattern: boolean
    selectedPattern: PatternDef | null
    patternFrameCount: number
    patternFps: number
    outputMode: 'still' | 'video'
    animateThumbnails: boolean
    /** Pattern id to auto-select on mount if nothing else is selected. */
    initialPatternId?: string
    onSelectPattern: (pat: PatternDef) => void
    onGeneratePreview: () => void
    onGenerateStill: () => void
  }

  let {
    isWriting, isGeneratingPreview, isGeneratingPattern,
    selectedPattern,
    patternFrameCount = $bindable(),
    patternFps = $bindable(),
    outputMode = $bindable(),
    animateThumbnails = $bindable(),
    initialPatternId,
    onSelectPattern, onGeneratePreview, onGenerateStill,
  }: Props = $props()

  // Restore last-used pattern on mount.
  $effect(() => {
    if (selectedPattern || !initialPatternId) return
    const found = PATTERNS.find(p => p.id === initialPatternId)
    if (found) onSelectPattern(found)
  })

  let lastAutoPreviewSignature = $state('')

  // Pattern selection should react quickly; numeric drags on Frames/FPS
  // still need a beat of coalescing to avoid recompute on every keystroke.
  // Pattern.id changes use a tiny 30 ms yield so the click visually
  // commits before the pipeline starts; param changes use 250 ms.
  const PATTERN_SELECT_DEBOUNCE_MS = 30
  const PARAM_DRAG_DEBOUNCE_MS = 250

  // Reactive derived values - computed once per dependency change instead
  // of on every template render (the size estimate was being called twice
  // in the markup, so this also drops one extra pass).
  const bytesPerFrame = $derived(selectedPattern?.bytesPerFrame ?? 14000)
  const estSize = $derived(patternFrameCount * (bytesPerFrame + 80) + 6000)
  const maxFrames = $derived(Math.max(10, Math.floor((MAX_UPLOAD_BYTES - 6000) / (bytesPerFrame + 80))))
  const overBudget = $derived(estSize > MAX_UPLOAD_BYTES)

  function handleGenerate() {
    if (outputMode === 'still') {
      onGenerateStill()
    } else {
      onGeneratePreview()
    }
  }

  $effect(() => {
    if (!selectedPattern) return
    if (isWriting || isGeneratingPreview || isGeneratingPattern) return

    const signature = outputMode === 'still'
      ? `still:${selectedPattern.id}`
      : `video:${selectedPattern.id}:${patternFrameCount}:${patternFps}`

    if (signature === lastAutoPreviewSignature) return

    // If only the pattern id changed (not frames/fps), it's a card click - fire fast.
    const prev = lastAutoPreviewSignature.split(':')
    const curr = signature.split(':')
    const isCardClick = prev[0] === curr[0] && prev[1] !== curr[1] && prev[2] === curr[2] && prev[3] === curr[3]
    const wait = isCardClick ? PATTERN_SELECT_DEBOUNCE_MS : PARAM_DRAG_DEBOUNCE_MS

    const timeout = setTimeout(() => {
      lastAutoPreviewSignature = signature
      if (outputMode === 'still') {
        onGenerateStill()
      } else {
        onGeneratePreview()
      }
    }, wait)

    return () => clearTimeout(timeout)
  })

  // Clamp frame count to the per-pattern safe maximum whenever the user
  // switches to a heavier pattern (e.g. Dither Magic). Prevents auto-
  // generation of a 4 MB AVI that the badge will reject.
  $effect(() => {
    if (!selectedPattern || outputMode !== 'video') return
    if (patternFrameCount > maxFrames) {
      patternFrameCount = maxFrames
    }
  })

  // Roving-tabindex keyboard nav across the pattern radiogroup.
  // Arrow keys move selection (and focus); Home/End jump to first/last.
  function onGridKeydown(e: KeyboardEvent): void {
    const key = e.key
    if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'ArrowUp'
        && key !== 'ArrowDown' && key !== 'Home' && key !== 'End') return
    const target = e.target as HTMLElement
    const id = target?.dataset?.patternCard
    if (!id) return
    e.preventDefault()
    const idx = PATTERNS.findIndex(p => p.id === id)
    if (idx < 0) return
    // Compute columns from the actual rendered grid so nav matches what the user sees.
    const grid = target.parentElement as HTMLElement | null
    const firstCard = grid?.querySelector<HTMLElement>('[data-pattern-card]')
    const cols = grid && firstCard
      ? Math.max(1, Math.round(grid.getBoundingClientRect().width / firstCard.getBoundingClientRect().width))
      : 1
    let next = idx
    if (key === 'ArrowRight') next = Math.min(PATTERNS.length - 1, idx + 1)
    else if (key === 'ArrowLeft') next = Math.max(0, idx - 1)
    else if (key === 'ArrowDown') next = Math.min(PATTERNS.length - 1, idx + cols)
    else if (key === 'ArrowUp') next = Math.max(0, idx - cols)
    else if (key === 'Home') next = 0
    else if (key === 'End') next = PATTERNS.length - 1
    if (next === idx) return
    onSelectPattern(PATTERNS[next])
    // Move focus on the next tick so the new tabindex=0 lands on the right button.
    queueMicrotask(() => {
      grid?.querySelector<HTMLElement>(`[data-pattern-card="${PATTERNS[next].id}"]`)?.focus()
    })
  }
</script>

<div class="flex flex-col gap-3">
  {#if selectedPattern}
    <div class="inline-flex self-start rounded-full bg-surface-container-low border border-outline-variant p-1 gap-1">
      <button
        type="button"
        class="px-3.5 py-1 rounded-full text-label-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-transform {outputMode === 'still' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:text-on-surface'}"
        onclick={() => outputMode = 'still'}
        disabled={isWriting}
      >Still</button>
      <button
        type="button"
        class="px-3.5 py-1 rounded-full text-label-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-transform {outputMode === 'video' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:text-on-surface'}"
        onclick={() => outputMode = 'video'}
        disabled={isWriting}
      >Video</button>
    </div>
  {/if}

  <div class="flex items-center justify-end gap-1.5 mb-1">
    <span id="animate-previews-label" class="text-label-sm text-on-surface-variant select-none">Animate previews</span>
    <button
      type="button"
      role="switch"
      aria-checked={animateThumbnails}
      aria-labelledby="animate-previews-label"
      class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer {animateThumbnails ? 'bg-primary' : 'bg-outline-variant'}"
      onclick={() => animateThumbnails = !animateThumbnails}
    >
      <span
        class="inline-block h-3.5 w-3.5 rounded-full bg-on-primary transition-transform {animateThumbnails ? 'translate-x-[18px]' : 'translate-x-[3px]'}"
      ></span>
    </button>
  </div>

  <div
    class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2"
    role="radiogroup"
    aria-label="Pattern selection"
    tabindex="-1"
    onkeydown={onGridKeydown}
  >
    {#each PATTERNS as pat, i}
      <button
        type="button"
        role="radio"
        aria-checked={selectedPattern?.id === pat.id}
        aria-label="{pat.name}: {pat.description}"
        data-pattern-card={pat.id}
        tabindex={selectedPattern?.id === pat.id || (!selectedPattern && i === 0) ? 0 : -1}
        class="group flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center border-2 transition-[colors,box-shadow,transform] duration-150 ease-m3-standard active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface {selectedPattern?.id === pat.id
          ? 'border-primary bg-primary-container/60 ring-1 ring-primary/40 shadow-elev-1'
          : 'border-outline-variant/60 bg-surface-container-low hover:border-primary/60 hover:bg-surface-container'}"
        onclick={() => onSelectPattern(pat)}
        disabled={isWriting}
      >
        <div class="relative w-10 h-10 flex items-center justify-center">
          <span class="text-2xl leading-none absolute inset-0 flex items-center justify-center">{pat.icon}</span>
          <PatternThumb pattern={pat} animate={animateThumbnails} />
        </div>
        <span class="text-label-md text-on-surface font-medium leading-tight">{pat.name}</span>
      </button>
    {/each}
  </div>

  {#if selectedPattern}
    <p
      class="text-body-sm text-on-surface-variant m-0 px-1"
      data-pattern-description={selectedPattern.id}
      aria-live="polite"
    >
      <span class="text-on-surface font-medium">{selectedPattern.name}:</span>
      {selectedPattern.description}
    </p>
  {/if}

  {#if selectedPattern && outputMode === 'video'}
    <FrameRateControls
      bind:frames={patternFrameCount}
      bind:fps={patternFps}
      maxFrames={maxFrames}
      minFrames={10}
      framesStep={10}
      {estSize}
      {overBudget}
      budgetBytes={MAX_UPLOAD_BYTES}
      disabled={isWriting}
    />
  {:else if selectedPattern && outputMode === 'still'}
    <p class="text-body-sm text-on-surface-variant m-0">
      Generates a single representative frame from the pattern.
    </p>
  {/if}
</div>
