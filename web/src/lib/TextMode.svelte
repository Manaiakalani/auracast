<script lang="ts">
  import { TEXT_EFFECTS, TEXT_FONTS, type TextEffect } from '../text-generator'
  import * as TextGen from '../text-generator'
  // Debug hook for the Playwright text-effect audit harness
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __AURACAST_TEXT__: typeof TextGen }).__AURACAST_TEXT__ = TextGen
  }
  import { MAX_UPLOAD_BYTES } from './image-processing'
  import FrameRateControls from './FrameRateControls.svelte'

  interface Props {
    isWriting: boolean
    isGeneratingPreview: boolean
    isGeneratingPattern: boolean // reused: text generation reuses the same flag
    text: string
    textEffect: TextEffect
    textFontId: string
    textColor: string
    textBackground: string
    textFps: number
    textFrames: number
    onGeneratePreview: () => void
    onGenerateStill: () => void
  }

  let {
    isWriting, isGeneratingPreview, isGeneratingPattern,
    text = $bindable(),
    textEffect = $bindable(),
    textFontId = $bindable(),
    textColor = $bindable(),
    textBackground = $bindable(),
    textFps = $bindable(),
    textFrames = $bindable(),
    onGeneratePreview, onGenerateStill,
  }: Props = $props()

  const PRESETS = [
    { label: 'White on black',  fg: '#f5f7ff', bg: '#000000' },
    { label: 'Hot pink',        fg: '#ff2f9c', bg: '#1a0010' },
    { label: 'Neon green',      fg: '#3effb6', bg: '#001a0a' },
    { label: 'Cyber cyan',      fg: '#3fd2fb', bg: '#000820' },
    { label: 'Warning yellow',  fg: '#ffe23f', bg: '#1a1300' },
    { label: 'Sunset orange',   fg: '#ff7a3f', bg: '#1a0a00' },
  ]

  let selectedEffectDef = $derived(TEXT_EFFECTS.find(e => e.id === textEffect) ?? TEXT_EFFECTS[0])
  let isStatic = $derived(selectedEffectDef.id === 'static')

  function estimatedSize(): number {
    const bpf = selectedEffectDef.bytesPerFrame
    const f = isStatic ? 1 : textFrames
    return f * (bpf + 80) + 6000
  }

  function maxFramesForCap(): number {
    const bpf = selectedEffectDef.bytesPerFrame
    return Math.max(8, Math.floor((MAX_UPLOAD_BYTES - 6000) / (bpf + 80)))
  }

  let lastSig = $state('')
  const DEBOUNCE = 280

  $effect(() => {
    if (isWriting || isGeneratingPreview || isGeneratingPattern) return
    if (!text.trim() && textEffect !== 'static') return
    const sig = `${text}|${textEffect}|${textFontId}|${textColor}|${textBackground}|${textFrames}|${textFps}`
    if (sig === lastSig) return
    const t = setTimeout(() => {
      lastSig = sig
      if (isStatic) onGenerateStill()
      else onGeneratePreview()
    }, DEBOUNCE)
    return () => clearTimeout(t)
  })

  // Clamp frames when switching to a heavier effect.
  $effect(() => {
    if (isStatic) return
    const cap = maxFramesForCap()
    if (textFrames > cap) textFrames = cap
  })
</script>

<div class="flex flex-col gap-5">
  <label class="flex flex-col gap-2">
    <span class="text-label-md text-on-surface-variant">Text</span>
    <input
      type="text"
      bind:value={text}
      placeholder="Hello world"
      maxlength="80"
      autocomplete="off"
      autocapitalize="sentences"
      enterkeyhint="done"
      disabled={isWriting}
    />
  </label>

  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    {#each TEXT_EFFECTS as eff}
      <button
        type="button"
        class="group relative flex flex-col items-start gap-1 rounded-2xl px-4 py-3 text-left border transition-[colors,box-shadow,transform] duration-150 ease-m3-standard isolate active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface {textEffect === eff.id
          ? 'border-primary bg-primary-container/30 shadow-elev-1'
          : 'border-outline-variant bg-surface-container-low hover:border-primary/60 hover:bg-surface-container'}"
        onclick={() => (textEffect = eff.id)}
        disabled={isWriting}
      >
        <span class="text-title-sm text-on-surface font-medium">{eff.name}</span>
        <span class="text-body-sm text-on-surface-variant leading-tight">{eff.description}</span>
      </button>
    {/each}
  </div>

  <div class="flex flex-wrap gap-5 items-end">
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Color</span>
      <input type="color" bind:value={textColor} disabled={isWriting} />
    </label>
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Background</span>
      <input type="color" bind:value={textBackground} disabled={isWriting} />
    </label>
    <label class="flex flex-col gap-2 min-w-[180px]">
      <span class="text-label-md text-on-surface-variant">Font</span>
      <select bind:value={textFontId} disabled={isWriting}>
        {#each TEXT_FONTS as f}
          <option value={f.id}>{f.label}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="flex flex-wrap gap-2">
    {#each PRESETS as p}
      <button
        type="button"
        class="rounded-full px-4 py-2 text-label-md font-medium border border-outline-variant transition-[transform,border-color] duration-150 ease-m3-standard hover:-translate-y-0.5 hover:border-primary active:scale-[0.97] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        onclick={() => { textColor = p.fg; textBackground = p.bg }}
        disabled={isWriting}
        style="background:{p.bg}; color:{p.fg};"
      >{p.label}</button>
    {/each}
  </div>

  {#if !isStatic}
    <FrameRateControls
      bind:frames={textFrames}
      bind:fps={textFps}
      maxFrames={maxFramesForCap()}
      minFrames={6}
      framesStep={2}
      minFps={2}
      estSize={estimatedSize()}
      overBudget={estimatedSize() > MAX_UPLOAD_BYTES}
      budgetBytes={MAX_UPLOAD_BYTES}
      disabled={isWriting}
    />
  {:else}
    <p class="text-body-sm text-on-surface-variant">Generates a single still image, no animation.</p>
  {/if}
</div>
