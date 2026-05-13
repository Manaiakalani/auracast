<script lang="ts" generics="T extends string | number">
  /**
   * M3 Navigation Bar - bottom nav for compact (mobile) layouts.
   * 80dp tall, max 5 destinations, indicator pill behind active label.
   */
  import Icon from './Icon.svelte'

  interface Destination<V> {
    value: V
    label: string
    icon: string
  }

  interface Props {
    destinations: Destination<T>[]
    value: T
    class?: string
    onchange?: (value: T) => void
  }

  let {
    destinations,
    value = $bindable(),
    class: klass = '',
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
  class="m3-nav-bar relative w-full bg-surface-container border-t border-outline-variant pb-[env(safe-area-inset-bottom)] {klass}"
>
  <ul class="flex items-stretch justify-around h-20 px-1">
    {#each destinations as d (d.value)}
      {@const active = d.value === value}
      <li class="flex-1 min-w-0">
        <button
          type="button"
          aria-label={d.label}
          aria-current={active ? 'page' : undefined}
          class="m3-nav-item group/nav relative flex flex-col items-center justify-center w-full h-full select-none touch-manipulation focus-visible:outline-none"
          onclick={() => select(d.value)}
        >
          <span class="indicator relative flex items-center justify-center min-w-[48px] sm:min-w-[64px] h-8 px-3 rounded-full transition-colors duration-200 ease-m3-emphasized {active ? 'bg-secondary-container' : 'bg-transparent'}">
            <span class="state-layer pointer-events-none absolute inset-0 rounded-full bg-on-surface opacity-0 transition-opacity duration-150 ease-m3-standard group-hover/nav:opacity-[0.08] group-focus-visible/nav:opacity-[0.12] group-active/nav:opacity-[0.16]"></span>
            <Icon name={d.icon} size={24} filled={active} class={active ? 'text-on-secondary-container' : 'text-on-surface-variant'} />
          </span>
          <span class="text-label-sm leading-tight mt-1 transition-colors duration-150 text-center px-0.5 {active ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}">{d.label}</span>
        </button>
      </li>
    {/each}
  </ul>
</nav>
