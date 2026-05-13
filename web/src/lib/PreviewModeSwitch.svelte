<script lang="ts">
  /**
   * PreviewModeSwitch - wrapper around M3 SegmentedButton for the
   * Live ↔ Preview mode toggle. Public API kept identical to the
   * pre-M3 version so existing call sites work unchanged.
   */
  import SegmentedButton from './m3/SegmentedButton.svelte'

  interface Props {
    mode: 'live' | 'preview'
    disabled?: boolean
  }

  let { mode = $bindable(), disabled = false }: Props = $props()

  const segments: { value: 'live' | 'preview'; label: string; icon: string }[] = [
    { value: 'live',    label: 'Live',    icon: 'tune' },
    { value: 'preview', label: 'Preview', icon: 'play_circle' },
  ]
</script>

<div class:opacity-50={disabled} class:pointer-events-none={disabled}>
  <SegmentedButton {segments} bind:value={mode} name="Preview mode" />
</div>
