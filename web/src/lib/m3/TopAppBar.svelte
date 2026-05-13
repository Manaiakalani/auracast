<script lang="ts">
  /**
   * M3 Top App Bar - small variant. Brand on the left, actions on the right.
   */
  import type { Snippet } from 'svelte'

  interface Props {
    title?: string
    elevated?: boolean
    class?: string
    leading?: Snippet
    trailing?: Snippet
    children?: Snippet
  }

  let {
    title,
    elevated = false,
    class: klass = '',
    leading,
    trailing,
    children,
  }: Props = $props()
</script>

<header class="m3-top-app-bar sticky top-0 z-30 w-full bg-surface backdrop-blur-md transition-shadow duration-200 ease-m3-standard {elevated ? 'shadow-elev-2 bg-surface-container' : ''} {klass}">
  <div class="flex items-center gap-3 h-16 px-3 sm:px-6 max-w-screen-2xl mx-auto">
    {#if leading}
      <div class="flex items-center shrink-0">{@render leading()}</div>
    {/if}
    {#if title || children}
      <div class="flex-1 min-w-0 flex items-center gap-3 text-on-surface">
        {#if title}<h1 class="text-title-lg truncate font-medium">{title}</h1>{/if}
        {#if children}{@render children()}{/if}
      </div>
    {/if}
    {#if trailing}
      <div class="flex items-center gap-1 shrink-0 ml-auto">{@render trailing()}</div>
    {/if}
  </div>
</header>
