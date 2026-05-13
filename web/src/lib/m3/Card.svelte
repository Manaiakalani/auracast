<script lang="ts">
  /**
   * M3 Card - three flavors per spec.
   * filled  -> surface-container-highest, no shadow
   * outlined -> surface, outline border, no shadow
   * elevated -> surface-container-low, elevation level 1
   */
  import type { Snippet } from 'svelte'

  type Variant = 'filled' | 'outlined' | 'elevated'

  interface Props {
    variant?: Variant
    interactive?: boolean
    href?: string
    class?: string
    onclick?: (e: MouseEvent) => void
    children: Snippet
  }

  let {
    variant = 'filled',
    interactive = false,
    href,
    class: klass = '',
    onclick,
    children,
  }: Props = $props()

  const variantClass = $derived(
    {
      filled:   'bg-surface-container-highest text-on-surface',
      outlined: 'bg-surface text-on-surface border border-outline-variant',
      elevated: 'bg-surface-container-low text-on-surface shadow-elev-1',
    }[variant],
  )

  const Tag = $derived(href ? 'a' : interactive || onclick ? 'button' : 'div')
</script>

<svelte:element
  this={Tag}
  {href}
  type={Tag === 'button' ? 'button' : undefined}
  role={Tag === 'div' && onclick ? 'button' : undefined}
  tabindex={Tag === 'div' && onclick ? 0 : undefined}
  class="m3-card group/card relative isolate rounded-2xl overflow-hidden transition-shadow duration-200 ease-m3-standard {variantClass} {(interactive || onclick) ? 'cursor-pointer text-left w-full hover:shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary' : ''} {klass}"
  {onclick}
>
  {#if interactive || onclick}
    <span class="state-layer pointer-events-none absolute inset-0 -z-10 bg-on-surface opacity-0 transition-opacity duration-150 ease-m3-standard group-hover/card:opacity-[0.08] group-focus-visible/card:opacity-[0.12] group-active/card:opacity-[0.12]"></span>
  {/if}
  {@render children()}
</svelte:element>
