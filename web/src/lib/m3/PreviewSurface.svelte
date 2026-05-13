<script lang="ts">
  /**
   * M3 PreviewSurface - circular badge preview disc with the canonical
   * AuraCast aura-ring shadow (cyan inner + violet outer halo) and an
   * M3-styled control row underneath. Used by AviPlayer (for AVI playback)
   * and LiveTransformCanvas (for image / live mode) so both previews share
   * the same M3 chrome.
   *
   * Slots:
   *   - default:  the canvas / image / video element (sized to fit)
   *   - controls: the bottom control row (play/pause, reset, frame counter, …)
   *   - empty:    placeholder content shown when nothing is loaded
   */
  import type { Snippet } from 'svelte'

  interface Props {
    size?: number
    /** Whether to show the empty snippet instead of children */
    empty?: boolean
    /** Soften the glow (non-interactive contexts) */
    quiet?: boolean
    /** Shimmer overlay (pipeline is generating new content) */
    busy?: boolean
    children?: Snippet
    controls?: Snippet
    empty_?: Snippet
  }

  let {
    size = 260,
    empty = false,
    quiet = false,
    busy = false,
    children,
    controls,
    empty_,
  }: Props = $props()
</script>

<div class="preview-surface">
  <div
    class="aura-disc {quiet ? 'aura-disc--quiet' : ''}"
    style="--preview-size: {size}px"
  >
    {#if empty && empty_}
      {@render empty_()}
    {:else if children}
      {@render children()}
    {/if}
    {#if busy}
      <div class="aura-disc-busy" aria-hidden="true"></div>
    {/if}
  </div>
  {#if controls}
    <div class="preview-controls">
      {@render controls()}
    </div>
  {/if}
</div>

<style>
  .preview-surface {
    margin: 0.5rem auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
  }

  .aura-disc {
    width: var(--preview-size);
    height: var(--preview-size);
    border-radius: 9999px;
    background: var(--md-sys-color-surface-container-lowest, #0e0e13);
    box-shadow: var(--aura-glow-disc);
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .aura-disc--quiet {
    box-shadow: var(--aura-glow-disc-quiet);
  }

  .aura-disc-busy {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(
      105deg,
      transparent 30%,
      color-mix(in srgb, var(--md-sys-color-primary) 22%, transparent) 50%,
      transparent 70%
    );
    background-size: 250% 100%;
    animation: aura-disc-shimmer 1.4s var(--md-sys-motion-easing-standard, cubic-bezier(0.2, 0, 0, 1)) infinite;
    mix-blend-mode: screen;
  }

  @keyframes aura-disc-shimmer {
    0%   { background-position: 150% 0; }
    100% { background-position: -50% 0; }
  }

  /* Reduced-motion users get a static gentle wash so they still know
     something is being computed without the moving sweep. */
  @media (prefers-reduced-motion: reduce) {
    .aura-disc-busy {
      animation: none;
      background: color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent);
    }
  }

  .aura-disc :global(canvas),
  .aura-disc :global(img),
  .aura-disc :global(video) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .preview-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }
</style>
