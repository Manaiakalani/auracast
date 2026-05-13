<script lang="ts">
  /**
   * Upload progress bar with percentage, elapsed time, and ETA.
   */
  import { formatDuration, formatBytes } from './utils'

  interface Props {
    isWriting: boolean
    progress: number
    progressLabel: string
    uploadStartTime: number
    sentBytes: number
    totalBytes: number
  }

  let { isWriting, progress, progressLabel, uploadStartTime, sentBytes, totalBytes }: Props = $props()

  let elapsed = $state('')
  let eta = $state('')
  let timerHandle: ReturnType<typeof setInterval> | null = null

  $effect(() => {
    if (isWriting && uploadStartTime > 0) {
      // Start timer
      if (timerHandle) clearInterval(timerHandle)
      timerHandle = setInterval(() => {
        const elapsedSec = (Date.now() - uploadStartTime) / 1000
        elapsed = formatDuration(elapsedSec)
        if (sentBytes > 0) {
          const rate = sentBytes / elapsedSec
          const remaining = (totalBytes - sentBytes) / rate
          eta = formatDuration(remaining)
        } else {
          eta = 'calculating…'
        }
      }, 500)
    } else {
      // Stop timer
      if (timerHandle) {
        clearInterval(timerHandle)
        timerHandle = null
      }
      if (uploadStartTime > 0) {
        elapsed = formatDuration((Date.now() - uploadStartTime) / 1000)
      }
      eta = ''
    }

    return () => {
      if (timerHandle) clearInterval(timerHandle)
    }
  })
</script>

<div class="w-full h-1.5 rounded-full overflow-hidden bg-surface-container-highest mt-2" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)} aria-label="Upload progress">
  <div class="h-full bg-primary transition-[width] duration-100 ease-out" style={`width:${progress}%`}></div>
</div>
{#if isWriting || progressLabel}
  <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1" role="status" aria-live="polite" aria-atomic="true">
    <p class="text-body-sm text-on-surface-variant m-0">{progressLabel}</p>
    {#if isWriting}
      <p class="text-body-sm text-on-surface-variant m-0 tabular">
        ⏱ {elapsed}
        {#if eta} · ETA: {eta}{/if}
      </p>
    {/if}
  </div>
{/if}
