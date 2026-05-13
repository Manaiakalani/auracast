<script lang="ts">
  /**
   * Image sequence upload mode - multi-file picker, fps, generate preview.
   */
  import Button from './m3/Button.svelte'

  interface Props {
    isWriting: boolean
    selectedFiles: File[]
    sequenceFps: number
    onSelectFiles: (event: Event) => void
  }

  let {
    isWriting, selectedFiles,
    sequenceFps = $bindable(), onSelectFiles,
  }: Props = $props()

  let fileInput: HTMLInputElement | null = $state(null)
</script>

<div class="flex flex-col gap-5">
  <div class="flex flex-wrap items-center gap-3">
    <Button
      variant={selectedFiles.length > 0 ? 'filled' : 'tonal'}
      size="md"
      icon="burst_mode"
      disabled={isWriting}
      onclick={() => fileInput?.click()}
    >
      Select images…
    </Button>
    <input bind:this={fileInput} type="file" accept="image/*" multiple onchange={onSelectFiles} disabled={isWriting} class="sr-only" />
    {#if selectedFiles.length > 0}
      <span class="text-body-sm text-on-surface-variant">
        <span class="tabular text-on-surface">{selectedFiles.length}</span> images selected
      </span>
    {/if}
  </div>

  <label class="flex flex-col gap-2">
    <span class="text-label-md text-on-surface-variant">Display time per image (fps)</span>
    <input type="number" inputmode="numeric" autocomplete="off" min="1" max="30" step="1" bind:value={sequenceFps} disabled={isWriting} class="tabular max-w-[8rem]" />
  </label>
  <p class="text-body-sm text-on-surface-variant">
    {#if sequenceFps === 1}Each image shows for 1 second
    {:else}Each image shows for <span class="tabular text-on-surface">{(1/sequenceFps).toFixed(2)}s</span> ({sequenceFps} fps)
    {/if}
  </p>
</div>
