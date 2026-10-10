import * as React from "react"

type AutoFocusHandler = ((event: Event) => void) | undefined

/**
 * Return focus to whatever opened a Radix Dialog / Sheet.
 *
 * Radix restores focus to its `DialogTrigger` ref on close. This app opens
 * every dialog programmatically (`open` state + a plain Button), so that ref
 * is always null and focus fell to <body>, stranding keyboard and
 * screen-reader users at the top of the page after every close (WCAG 2.4.3).
 *
 * `onOpenAutoFocus` fires when the content mounts and BEFORE the focus scope
 * moves focus inside, so `document.activeElement` is still the opener there.
 * `onCloseAutoFocus` prevents Radix's default (which would focus the missing
 * trigger) and focuses the remembered element if it is still in the document.
 * Caller-supplied handlers run first and win if they `preventDefault`.
 */
export function useReturnFocus({ onOpenAutoFocus, onCloseAutoFocus }: {
  onOpenAutoFocus: AutoFocusHandler
  onCloseAutoFocus: AutoFocusHandler
}) {
  const opener = React.useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: (e: Event) => {
      const el = document.activeElement
      opener.current = el instanceof HTMLElement && el !== document.body ? el : null
      onOpenAutoFocus?.(e)
    },
    onCloseAutoFocus: (e: Event) => {
      onCloseAutoFocus?.(e)
      if (e.defaultPrevented) return
      const el = opener.current
      if (el && el.isConnected) {
        e.preventDefault()
        el.focus()
      }
    },
  }
}
