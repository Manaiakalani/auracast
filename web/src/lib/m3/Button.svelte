<script lang="ts">
  /**
   * M3 Button - canonical anatomy with a state layer that animates
   * opacity on hover/focus/press.
   *
   * Variants: filled (default), tonal, outlined, text, elevated.
   * Sizes follow the M3 expressive scale: xs (32dp), sm (40dp), md (40dp default), lg (56dp), xl (96dp).
   */
  import Icon from './Icon.svelte'
  import type { Snippet } from 'svelte'

  type Variant = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated'
  type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

  interface Props {
    variant?: Variant
    size?: Size
    icon?: string
    trailingIcon?: string
    iconFilled?: boolean
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    fullWidth?: boolean
    class?: string
    ariaLabel?: string
    onclick?: (e: MouseEvent) => void
    children?: Snippet
  }

  let {
    variant = 'filled',
    size = 'md',
    icon,
    trailingIcon,
    iconFilled = false,
    type = 'button',
    disabled = false,
    fullWidth = false,
    class: klass = '',
    ariaLabel,
    onclick,
    children,
  }: Props = $props()

  const sizeClass = $derived(
    {
      xs: 'h-8 px-3 text-label-md gap-1.5',
      sm: 'h-9 px-4 text-label-lg gap-2',
      md: 'h-10 px-6 text-label-lg gap-2',
      lg: 'h-14 px-8 text-title-md gap-2.5',
      xl: 'h-24 px-12 text-headline-sm gap-3',
    }[size],
  )

  const iconSize = $derived(
    ({ xs: 18, sm: 18, md: 20, lg: 24, xl: 32 }[size]) as 18 | 20 | 24 | 32,
  )

  const variantClass = $derived(
    {
      filled:   'bg-primary text-on-primary shadow-elev-0 hover:shadow-elev-1',
      tonal:    'bg-secondary-container text-on-secondary-container shadow-elev-0 hover:shadow-elev-1',
      outlined: 'bg-transparent text-primary border border-outline hover:border-on-surface',
      text:     'bg-transparent text-primary',
      elevated: 'bg-surface-container-low text-primary shadow-elev-1 hover:shadow-elev-2',
    }[variant],
  )
</script>

<button
  {type}
  {disabled}
  class="m3-button group/btn relative inline-flex items-center justify-center isolate rounded-full font-medium select-none whitespace-nowrap touch-manipulation transition-[box-shadow,transform] duration-150 ease-m3-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 {sizeClass} {variantClass} {fullWidth ? 'w-full' : ''} {klass}"
  aria-label={ariaLabel}
  {onclick}
>
  <span class="state-layer pointer-events-none absolute inset-0 -z-10 rounded-full bg-current opacity-0 transition-opacity duration-150 ease-m3-standard group-hover/btn:opacity-[0.08] group-focus-visible/btn:opacity-[0.12] group-active/btn:opacity-[0.16]"></span>
  {#if icon}
    <Icon name={icon} size={iconSize} filled={iconFilled} />
  {/if}
  {#if children}<span class="leading-none">{@render children()}</span>{/if}
  {#if trailingIcon}
    <Icon name={trailingIcon} size={iconSize} filled={iconFilled} />
  {/if}
</button>

<style>
  .m3-button { -webkit-tap-highlight-color: transparent; }
</style>
