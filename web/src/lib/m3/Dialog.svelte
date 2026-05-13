<script lang="ts">
  /**
   * M3 Dialog - modal on expanded, full-screen on compact.
   * Renders a scrim, a dialog surface (extra-large rounded corners),
   * headline, body, and an action row.
   *
   * Focus management:
   *   - On open we move focus into the dialog surface (or the first
   *     focusable descendant) and remember whatever owned focus before.
   *   - Tab / Shift+Tab cycles within the dialog (basic focus trap).
   *   - On close we return focus to the previously-focused element so
   *     keyboard users land back where they triggered the dialog from.
   */
  import IconButton from './IconButton.svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    open: boolean
    headline?: string
    icon?: string
    fullScreenOnCompact?: boolean
    closeLabel?: string
    class?: string
    onclose?: () => void
    children: Snippet
    actions?: Snippet
  }

  let {
    open = $bindable(),
    headline,
    icon: _icon,
    fullScreenOnCompact = true,
    closeLabel = 'Close',
    class: klass = '',
    onclose,
    children,
    actions,
  }: Props = $props()

  let surfaceEl: HTMLDivElement | null = $state(null)
  let lastFocused: HTMLElement | null = null

  const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')

  function focusables(): HTMLElement[] {
    if (!surfaceEl) return []
    return Array.from(surfaceEl.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(el => !el.hasAttribute('aria-hidden') && el.offsetParent !== null)
  }

  $effect(() => {
    if (!open) return
    // Capture the trigger so we can restore focus when the dialog closes.
    if (typeof document !== 'undefined') {
      lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    // Wait one microtask so the surface is mounted, then move focus in.
    queueMicrotask(() => {
      const list = focusables()
      // Skip the close button (first focusable) and prefer the next item
      // so Tab order feels natural; fall back to the surface itself.
      const target = list[1] ?? list[0] ?? surfaceEl
      target?.focus()
    })
    return () => {
      // Restore focus on close as long as the trigger is still in the DOM.
      if (lastFocused && lastFocused.isConnected) lastFocused.focus()
    }
  })

  function close() {
    open = false
    onclose?.()
  }

  function onScrimClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close()
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { close(); return }
    if (e.key !== 'Tab') return
    const list = focusables()
    if (list.length === 0) { e.preventDefault(); return }
    const first = list[0]
    const last = list[list.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (e.shiftKey) {
      if (active === first || !surfaceEl?.contains(active)) {
        e.preventDefault(); last.focus()
      }
    } else {
      if (active === last) { e.preventDefault(); first.focus() }
    }
  }
</script>

<svelte:window onkeydown={open ? onKey : null} />

{#if open}
  <div
    class="m3-dialog-scrim fixed inset-0 z-50 flex items-center justify-center bg-scrim/60 backdrop-blur-sm transition-opacity duration-200 ease-m3-standard"
    role="presentation"
    onclick={onScrimClick}
  >
    <div
      bind:this={surfaceEl}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headline ? 'm3-dialog-title' : undefined}
      tabindex="-1"
      class="m3-dialog relative bg-surface-container-high text-on-surface shadow-elev-3 flex flex-col focus:outline-none {fullScreenOnCompact ? 'w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-3xl' : 'w-full max-w-lg max-h-[85vh] rounded-3xl m-4'} {klass}"
    >
      <header class="flex items-start gap-3 px-6 pt-6 pb-3">
        {#if headline}
          <h2 id="m3-dialog-title" class="flex-1 text-headline-sm text-on-surface">{headline}</h2>
        {/if}
        <IconButton icon="close" ariaLabel={closeLabel} size="md" onclick={close} class="-mr-2 -mt-1" />
      </header>
      <div class="flex-1 overflow-y-auto px-6 pb-6 text-body-md text-on-surface-variant">
        {@render children()}
      </div>
      {#if actions}
        <footer class="flex flex-wrap items-center justify-end gap-2 px-6 pb-6 pt-2 border-t border-outline-variant">
          {@render actions()}
        </footer>
      {/if}
    </div>
  </div>
{/if}
