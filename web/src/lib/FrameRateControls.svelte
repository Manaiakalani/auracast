<script lang="ts">
  /**
   * Shared Frames + FPS + duration/size summary row.
   *
   * Used by PatternMode and TextMode so the controls live in the exact
   * same layout, sizing, and label conventions across both modes. Keep
   * the surface API minimal: bindable numeric inputs + a derived summary
   * line driven entirely by props so callers don't need to wire reactive
   * derivations of their own.
   */
  import { formatBytes } from './utils'

  interface Props {
    frames: number
    fps: number
    /** Hard cap on frames input (caller computes from byte budget). */
    maxFrames: number
    minFrames?: number
    framesStep?: number
    minFps?: number
    maxFps?: number
    fpsStep?: number
    /** Estimated upload bytes for the duration line. */
    estSize: number
    /** Whether `estSize` exceeds the hardware budget. */
    overBudget: boolean
    /** Hardware byte budget for the % indicator. Optional: hides if absent. */
    budgetBytes?: number
    disabled?: boolean
  }

  let {
    frames = $bindable(),
    fps = $bindable(),
    maxFrames,
    minFrames = 6,
    framesStep = 2,
    minFps = 1,
    maxFps = 30,
    fpsStep = 1,
    estSize,
    overBudget,
    budgetBytes,
    disabled = false,
  }: Props = $props()

  const durationSec = $derived((frames / Math.max(1, fps)).toFixed(1))
  const maxDurationSec = $derived((maxFrames / Math.max(1, fps)).toFixed(1))
  // Percent of the hardware budget consumed - clamped to [0, 999] so a
  // wildly over-budget render still renders sanely in the UI.
  const budgetPct = $derived(
    budgetBytes ? Math.min(999, Math.round((estSize / budgetBytes) * 100)) : null,
  )
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap gap-5 items-end">
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">Frames</span>
      <input
        type="number"
        inputmode="numeric"
        autocomplete="off"
        min={minFrames}
        max={maxFrames}
        step={framesStep}
        bind:value={frames}
        {disabled}
        class="tabular max-w-[8rem]"
      />
    </label>
    <label class="flex flex-col gap-2">
      <span class="text-label-md text-on-surface-variant">FPS</span>
      <input
        type="number"
        inputmode="numeric"
        autocomplete="off"
        min={minFps}
        max={maxFps}
        step={fpsStep}
        bind:value={fps}
        {disabled}
        class="tabular max-w-[6rem]"
      />
    </label>
  </div>
  <p class="text-body-sm text-on-surface-variant m-0">
    Duration: <span class="tabular text-on-surface">{durationSec}s</span> ·
    est. <span class="tabular text-on-surface">{formatBytes(estSize)}</span>
    {#if budgetPct !== null}
      <span class="tabular {overBudget ? 'text-error' : budgetPct > 80 ? 'text-tertiary' : 'text-on-surface-variant'}">({budgetPct}% of limit)</span>
    {/if}
    {#if overBudget}<span class="text-error font-medium ml-2">⚠ may exceed limit</span>{/if}
  </p>
  {#if budgetPct !== null}
    <div
      class="frame-budget-bar"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.min(100, budgetPct)}
      aria-label="Upload size as percent of badge memory budget"
    >
      <div
        class="frame-budget-bar__fill"
        class:frame-budget-bar__fill--warn={budgetPct > 80 && !overBudget}
        class:frame-budget-bar__fill--over={overBudget}
        style="width: {Math.min(100, budgetPct)}%"
      ></div>
    </div>
  {/if}
  <p class="text-label-sm text-on-surface-variant m-0 -mt-1">
    Fits up to <span class="tabular text-on-surface">{maxFrames}</span> frames
    (<span class="tabular">{maxDurationSec}s</span>) at this FPS.
  </p>
</div>

<style>
  .frame-budget-bar {
    height: 4px;
    border-radius: 9999px;
    background: var(--md-sys-color-surface-container-high, rgba(255,255,255,0.08));
    overflow: hidden;
    margin-top: -0.25rem;
  }
  .frame-budget-bar__fill {
    height: 100%;
    background: var(--md-sys-color-primary);
    border-radius: 9999px;
    transition: width 240ms var(--md-sys-motion-easing-standard, cubic-bezier(0.2, 0, 0, 1)),
                background-color 240ms var(--md-sys-motion-easing-standard, cubic-bezier(0.2, 0, 0, 1));
  }
  .frame-budget-bar__fill--warn {
    background: var(--md-sys-color-tertiary);
  }
  .frame-budget-bar__fill--over {
    background: var(--md-sys-color-error);
  }
  @media (prefers-reduced-motion: reduce) {
    .frame-budget-bar__fill { transition: none; }
  }
</style>
