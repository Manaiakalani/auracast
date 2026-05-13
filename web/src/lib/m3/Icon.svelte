<script lang="ts">
  /**
   * M3 Icon - wraps Material Symbols Outlined with token-driven sizing
   * and the M3 fill/weight/grade variation axes.
   */
  interface Props {
    name: string
    size?: 18 | 20 | 24 | 28 | 32 | 36 | 40 | 48
    filled?: boolean
    weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700
    grade?: -25 | 0 | 200
    class?: string
    ariaLabel?: string
  }

  let {
    name,
    size = 24,
    filled = false,
    weight = 400,
    grade = 0,
    class: klass = '',
    ariaLabel,
  }: Props = $props()

  const fontVariation = $derived(
    `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${size}`,
  )
</script>

<span
  class="material-symbols-outlined m3-icon {klass}"
  style:font-size="{size}px"
  style:width="{size}px"
  style:height="{size}px"
  style:line-height="{size}px"
  style:font-variation-settings={fontVariation}
  aria-hidden={ariaLabel ? undefined : 'true'}
  aria-label={ariaLabel}
  role={ariaLabel ? 'img' : undefined}
>
  {name}
</span>

<style>
  .m3-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    flex-shrink: 0;
    -webkit-font-feature-settings: 'liga';
    font-feature-settings: 'liga';
  }
</style>
