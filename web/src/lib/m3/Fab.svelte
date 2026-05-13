<script lang="ts">
  /**
   * M3 FAB - primary action, surface-tinted with brand glow on focus.
   * Variants: surface (default), primary, secondary, tertiary.
   * Sizes: sm (40dp), md (56dp default), lg (96dp), extended (auto width).
   */
  import Icon from './Icon.svelte'
  import type { Snippet } from 'svelte'

  type Variant = 'surface' | 'primary' | 'secondary' | 'tertiary'
  type Size = 'sm' | 'md' | 'lg' | 'extended'

  interface Props {
    icon: string
    variant?: Variant
    size?: Size
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    class?: string
    ariaLabel: string
    onclick?: (e: MouseEvent) => void
    children?: Snippet
  }

  let {
    icon,
    variant = 'primary',
    size = 'md',
    disabled = false,
    type = 'button',
    class: klass = '',
    ariaLabel,
    onclick,
    children,
  }: Props = $props()

  const sizeClass = $derived(
    {
      sm:       'h-10 w-10 rounded-xl text-label-lg',
      md:       'h-14 w-14 rounded-2xl text-title-md',
      lg:       'h-24 w-24 rounded-3xl text-title-lg',
      extended: 'h-14 px-6 rounded-2xl text-title-md min-w-[80px] gap-3',
    }[size],
  )
  const iconSize = $derived(
    ({ sm: 20, md: 24, lg: 36, extended: 24 }[size]) as 20 | 24 | 36,
  )
  const variantClass = $derived(
    {
      surface:   'bg-surface-container-high text-primary',
      primary:   'bg-primary-container text-on-primary-container',
      secondary: 'bg-secondary-container text-on-secondary-container',
      tertiary:  'bg-tertiary-container text-on-tertiary-container',
    }[variant],
  )
</script>

<button
  {type}
  {disabled}
  aria-label={ariaLabel}
  class="m3-fab group/fab relative inline-flex items-center justify-center isolate font-medium select-none touch-manipulation shadow-elev-3 transition-[box-shadow,transform] duration-200 ease-m3-standard hover:shadow-elev-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 {sizeClass} {variantClass} {klass}"
  {onclick}
>
  <span class="state-layer pointer-events-none absolute inset-0 -z-10 {size === 'sm' ? 'rounded-xl' : size === 'lg' ? 'rounded-3xl' : 'rounded-2xl'} bg-current opacity-0 transition-opacity duration-150 ease-m3-standard group-hover/fab:opacity-[0.08] group-focus-visible/fab:opacity-[0.12] group-active/fab:opacity-[0.16]"></span>
  <Icon name={icon} size={iconSize} />
  {#if children && size === 'extended'}<span class="leading-none">{@render children()}</span>{/if}
</button>
