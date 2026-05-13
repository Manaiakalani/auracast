<script lang="ts">
  /**
   * Video upload mode - file picker, trim/zoom controls, fps, preview.
   */
  import { formatBytes } from './utils'
  import { MAX_UPLOAD_BYTES } from './image-processing'
  import Button from './m3/Button.svelte'

  interface Props {
    isWriting: boolean
    selectedFile: File | null
    videoFps: number
    videoTrimStart: number
    videoTrimEnd: number
    videoDuration: number
    onSelectVideo: (event: Event) => void
    onScrubStart?: () => void
    onScrubFrame?: (time: number) => void
    onScrubEnd?: () => void
  }

  let {
    isWriting, selectedFile,
    videoFps = $bindable(),
    videoTrimStart = $bindable(),
    videoTrimEnd = $bindable(),
    videoDuration,
    onSelectVideo,
    onScrubStart,
    onScrubFrame,
    onScrubEnd,
  }: Props = $props()

  const MAX_CLIP_SECONDS = 10
  let fileInput: HTMLInputElement | null = $state(null)

  $effect(() => {
    if (videoDuration <= 0) return

    videoTrimStart = Math.max(0, Math.min(videoDuration, videoTrimStart))
    videoTrimEnd = Math.max(0, Math.min(videoDuration, videoTrimEnd))

    if (videoTrimEnd < videoTrimStart) {
      videoTrimEnd = videoTrimStart
    }

    if (videoTrimEnd - videoTrimStart > MAX_CLIP_SECONDS) {
      videoTrimEnd = Math.min(videoDuration, videoTrimStart + MAX_CLIP_SECONDS)
    }
  })

  function handleStartInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    videoTrimStart = Math.max(0, Math.min(videoDuration, value))

    if (videoTrimStart > videoTrimEnd) {
      videoTrimEnd = videoTrimStart
    }
    if (videoTrimEnd - videoTrimStart > MAX_CLIP_SECONDS) {
      videoTrimEnd = Math.min(videoDuration, videoTrimStart + MAX_CLIP_SECONDS)
    }

    onScrubFrame?.(videoTrimStart)
  }

  function handleEndInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    videoTrimEnd = Math.max(0, Math.min(videoDuration, value))

    if (videoTrimEnd < videoTrimStart) {
      videoTrimStart = videoTrimEnd
    }
    if (videoTrimEnd - videoTrimStart > MAX_CLIP_SECONDS) {
      videoTrimStart = Math.max(0, videoTrimEnd - MAX_CLIP_SECONDS)
    }

    onScrubFrame?.(videoTrimEnd)
  }

  function handleScrubStart(): void {
    onScrubStart?.()
  }

  function handleScrubEnd(): void {
    onScrubEnd?.()
  }

  function estimatedFrames(): number {
    return Math.ceil(Math.max(0, videoTrimEnd - videoTrimStart) * videoFps)
  }

  function estimatedSize(): number {
    return estimatedFrames() * 8000 + 6000
  }

</script>

<div class="flex flex-col gap-5">
  <div class="flex flex-wrap items-center gap-3">
    <Button
      variant={selectedFile ? 'filled' : 'tonal'}
      size="md"
      icon="movie"
      disabled={isWriting}
      onclick={() => fileInput?.click()}
    >
      Select video…
    </Button>
    <input bind:this={fileInput} type="file" accept="video/*" onchange={onSelectVideo} disabled={isWriting} class="sr-only" />
    {#if selectedFile}
      <span class="text-body-sm text-on-surface-variant truncate max-w-[40ch]">{selectedFile.name}</span>
    {/if}
  </div>

  {#if selectedFile && videoDuration > 0}
    <div class="rounded-2xl bg-surface-container-low border border-outline-variant p-4 sm:p-5 flex flex-col gap-4">
      <h3 class="text-title-sm text-on-surface font-semibold m-0">Trim & frame rate</h3>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <label class="flex flex-col gap-2">
          <span class="text-label-md text-on-surface-variant">Start <span class="tabular text-on-surface">{videoTrimStart.toFixed(1)}s</span></span>
          <input
            type="range"
            min="0"
            max={videoDuration}
            step="0.05"
            bind:value={videoTrimStart}
            disabled={isWriting}
            onpointerdown={handleScrubStart}
            onpointerup={handleScrubEnd}
            onpointercancel={handleScrubEnd}
            oninput={handleStartInput}
            onchange={handleScrubEnd}
          />
        </label>
        <label class="flex flex-col gap-2">
          <span class="text-label-md text-on-surface-variant">End <span class="tabular text-on-surface">{videoTrimEnd.toFixed(1)}s</span></span>
          <input
            type="range"
            min="0"
            max={videoDuration}
            step="0.05"
            bind:value={videoTrimEnd}
            disabled={isWriting}
            onpointerdown={handleScrubStart}
            onpointerup={handleScrubEnd}
            onpointercancel={handleScrubEnd}
            oninput={handleEndInput}
            onchange={handleScrubEnd}
          />
        </label>
      </div>

      <p class="text-body-sm text-on-surface-variant m-0">
        Duration: <span class="tabular text-on-surface">{(Math.max(0, videoTrimEnd - videoTrimStart)).toFixed(1)}s</span>
        / <span class="tabular">{MAX_CLIP_SECONDS.toFixed(0)}s</span> max
        · ~<span class="tabular text-on-surface">{estimatedFrames()}</span> frames
        · est. <span class="tabular text-on-surface">{formatBytes(estimatedSize())}</span>
        {#if estimatedSize() > MAX_UPLOAD_BYTES}
          <span class="text-error font-medium ml-2">⚠ over {formatBytes(MAX_UPLOAD_BYTES)} limit!</span>
        {/if}
      </p>

      <label class="flex flex-col gap-2 max-w-[12rem]">
        <span class="text-label-md text-on-surface-variant">Frame rate (fps)</span>
        <input type="number" inputmode="numeric" autocomplete="off" min="1" max="30" step="1" bind:value={videoFps} disabled={isWriting} class="tabular" />
      </label>
    </div>
  {/if}
</div>
