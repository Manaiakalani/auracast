<script lang="ts" generics="T">
  /**
   * M3 Segmented Button - single-select. Each segment shows a check icon
   * when selected per spec.
   */
  import Icon from './Icon.svelte'

  interface Segment<V> {
    value: V
    label: string
    icon?: string
    ariaLabel?: string
  }

  interface Props {
    segments: Segment<T>[]
    value: T
    name?: string
    fullWidth?: boolean
    class?: string
    onchange?: (value: T) => void
  }

  let {
    segments,
    value = $bindable(),
    name,
    fullWidth = false,
    class: klass = '',
    onchange,
  }: Props = $props()

  function select(v: T) {
    value = v
    onchange?.(v)
  }
</script>

<div
  role="radiogroup"
  aria-label={name}
  class="m3-segmented inline-flex items-stretch border border-outline rounded-full overflow-hidden bg-surface {fullWidth ? 'w-full' : ''} {klass}"
>
  {#each segments as seg, i (seg.value)}
    {@const selected = seg.value === value}
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={seg.ariaLabel ?? seg.label}
      class="m3-seg group/seg relative isolate inline-flex items-center justify-center gap-2 h-10 px-4 text-label-lg select-none touch-manipulation transition-[colors,transform] duration-150 ease-m3-standard focus-visible:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:scale-[0.97] {fullWidth ? 'flex-1' : ''} {selected ? 'bg-secondary-container text-on-secondary-container' : 'bg-transparent text-on-surface'} {i > 0 ? 'border-l border-outline' : ''}"
      onclick={() => select(seg.value)}
    >
      <span class="state-layer pointer-events-none absolute inset-0 -z-10 bg-on-surface opacity-0 transition-opacity duration-150 ease-m3-standard group-hover/seg:opacity-[0.08] group-focus-visible/seg:opacity-[0.12] group-active/seg:opacity-[0.16]"></span>
      {#if selected}
        <Icon name="check" size={18} />
      {:else if seg.icon}
        <Icon name={seg.icon} size={18} />
      {/if}
      <span class="leading-none whitespace-nowrap">{seg.label}</span>
    </button>
  {/each}
</div>

<style>
  .m3-seg { -webkit-tap-highlight-color: transparent; }
</style>
