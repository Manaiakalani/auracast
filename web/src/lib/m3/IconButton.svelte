<script lang="ts">
  /**
   * M3 Icon Button - circular tap target with state layer.
   * Sizes follow the M3 expressive 40dp default, with 32/48/56 alternates.
   */
  import Icon from './Icon.svelte'

  type Variant = 'standard' | 'filled' | 'tonal' | 'outlined'
  type Size = 'xs' | 'sm' | 'md' | 'lg'

  interface Props {
    icon: string
    variant?: Variant
    size?: Size
    iconFilled?: boolean
    selected?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    class?: string
    ariaLabel: string
    onclick?: (e: MouseEvent) => void
    onpointerdown?: (e: PointerEvent) => void
    onpointerup?: (e: PointerEvent) => void
    onpointerleave?: (e: PointerEvent) => void
    onpointercancel?: (e: PointerEvent) => void
  }

  let {
    icon,
    variant = 'standard',
    size = 'md',
    iconFilled = false,
    selected = false,
    disabled = false,
    type = 'button',
    class: klass = '',
    ariaLabel,
    onclick,
    onpointerdown,
    onpointerup,
    onpointerleave,
    onpointercancel,
  }: Props = $props()

  const sizeClass = $derived(
    ({ xs: 'w-8 h-8', sm: 'w-9 h-9', md: 'w-10 h-10', lg: 'w-12 h-12' }[size]),
  )
  const iconSize = $derived(
    ({ xs: 18, sm: 20, md: 24, lg: 24 }[size]) as 18 | 20 | 24,
  )

  const variantClass = $derived(
    selected
      ? {
          standard: 'bg-transparent text-primary',
          filled:   'bg-primary text-on-primary',
          tonal:    'bg-secondary-container text-on-secondary-container',
          outlined: 'bg-inverse-surface text-inverse-on-surface border border-outline',
        }[variant]
      : {
          standard: 'bg-transparent text-on-surface-variant',
          filled:   'bg-surface-container-highest text-primary',
          tonal:    'bg-surface-container-highest text-on-surface-variant',
          outlined: 'bg-transparent text-on-surface-variant border border-outline',
        }[variant],
  )
</script>

<button
  {type}
  {disabled}
  aria-label={ariaLabel}
  aria-pressed={selected}
  class="m3-icon-btn group/icb relative inline-flex items-center justify-center isolate rounded-full select-none touch-manipulation transition-[colors,transform] duration-150 ease-m3-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.92] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 {sizeClass} {variantClass} {klass}"
  {onclick}
  {onpointerdown}
  {onpointerup}
  {onpointerleave}
  {onpointercancel}
>
  <span class="state-layer pointer-events-none absolute inset-0 -z-10 rounded-full bg-current opacity-0 transition-opacity duration-150 ease-m3-standard group-hover/icb:opacity-[0.08] group-focus-visible/icb:opacity-[0.12] group-active/icb:opacity-[0.16]"></span>
  <Icon name={icon} size={iconSize} filled={iconFilled || selected} />
</button>

<style>
  .m3-icon-btn { -webkit-tap-highlight-color: transparent; }
</style>
