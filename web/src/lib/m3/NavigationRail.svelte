<script lang="ts" generics="T extends string | number">
  /**
   * M3 Navigation Rail - left rail for medium/expanded breakpoints.
   * 80dp wide, FAB slot at top, destinations stacked, footer slot at bottom.
   */
  import Icon from './Icon.svelte'
  import type { Snippet } from 'svelte'

  interface Destination<V> {
    value: V
    label: string
    icon: string
  }

  interface Props {
    destinations: Destination<T>[]
    value: T
    class?: string
    fab?: Snippet
    footer?: Snippet
    brand?: Snippet
    onchange?: (value: T) => void
  }

  let {
    destinations,
    value = $bindable(),
    class: klass = '',
    fab,
    footer,
    brand,
    onchange,
  }: Props = $props()

  function select(v: T) {
    if (v === value) return
    value = v
    onchange?.(v)
  }
</script>

<nav
  aria-label="Primary"
  class="m3-nav-rail flex flex-col items-center w-20 h-full bg-surface-container py-4 {klass}"
>
  {#if brand}
    <div class="mb-4 flex flex-col items-center">{@render brand()}</div>
  {/if}
  {#if fab}
    <div class="mb-6">{@render fab()}</div>
  {/if}
  <ul class="flex-1 flex flex-col items-center justify-start gap-2 w-full px-2 pt-1">
    {#each destinations as d (d.value)}
      {@const active = d.value === value}
      <li class="w-full">
        <button
          type="button"
          aria-label={d.label}
          aria-current={active ? 'page' : undefined}
          class="m3-rail-item group/rail relative flex flex-col items-center justify-center gap-1 w-full py-1 min-h-[48px] select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container rounded-2xl"
          onclick={() => select(d.value)}
        >
          <span
            class="indicator relative flex items-center justify-center w-16 h-9 rounded-full transition-[background-color,transform] duration-200 ease-m3-emphasized group-active/rail:scale-95 {active ? 'bg-secondary-container' : 'bg-transparent'}"
          >
            <span class="state-layer pointer-events-none absolute inset-0 rounded-full bg-on-surface opacity-0 transition-opacity duration-150 ease-m3-standard group-hover/rail:opacity-[0.08] group-focus-visible/rail:opacity-[0.12] group-active/rail:opacity-[0.16]"></span>
            <Icon
              name={d.icon}
              size={26}
              filled={active}
              class="relative {active ? 'text-on-secondary-container' : 'text-on-surface-variant'}"
            />
          </span>
          <span class="text-label-md leading-4 transition-colors duration-150 {active ? 'text-on-surface font-medium' : 'text-on-surface-variant font-normal'}">{d.label}</span>
        </button>
      </li>
    {/each}
  </ul>
  {#if footer}
    <div class="mt-4 w-full flex flex-col items-center gap-2">{@render footer()}</div>
  {/if}
</nav>
