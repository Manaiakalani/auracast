<script lang="ts">
  /**
   * Single image upload mode - file picker + preview.
   */
  import Button from './m3/Button.svelte'

  interface Props {
    isWriting: boolean
    selectedFile: File | null
    backdropColor: string
    onSelectFile: (event: Event) => void
  }

  let { isWriting, selectedFile, backdropColor = $bindable(), onSelectFile }: Props = $props()

  let fileInput: HTMLInputElement | null = $state(null)
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center gap-3">
    <Button
      variant="tonal"
      size="md"
      icon="image"
      disabled={isWriting}
      onclick={() => fileInput?.click()}
    >
      Choose image…
    </Button>
    <input bind:this={fileInput} type="file" accept="image/*" onchange={onSelectFile} disabled={isWriting} class="sr-only" />
    {#if selectedFile}
      <span class="text-body-sm text-on-surface-variant truncate max-w-[40ch]">{selectedFile.name}</span>
    {/if}
  </div>

  <label class="flex flex-col gap-2">
    <span class="text-label-md text-on-surface-variant">Backdrop color</span>
    <input
      type="color"
      bind:value={backdropColor}
      disabled={isWriting}
      class="w-12 h-12 rounded-xl bg-surface-container-low border border-outline-variant cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed appearance-none p-1"
    />
  </label>
</div>
