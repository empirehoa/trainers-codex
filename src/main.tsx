import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from '@/i18n/I18nProvider'
import { stampProvenance } from '@/lib/provenance'
import { resetLocalData } from '@/lib/storage'

// Attribution + build fingerprint, before anything renders.
stampProvenance()

/**
 * Last line of defence against a persistent white screen.
 *
 * Everything the app restores from localStorage is shape-checked in
 * `lib/storage.ts`, so a crafted payload should never reach a render. If one
 * does anyway (a future field, a browser quirk), React unmounts the whole tree
 * and — because the payload is already persisted — every reload does the same.
 * Without this the only recovery was DevTools → localStorage.clear(). The
 * fallback says what happened, offers a plain reload, and a one-click reset of
 * every `trainerscodex.*` key.
 *
 * Deliberately a class: React only exposes error boundaries through
 * `componentDidCatch` / `getDerivedStateFromError`.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[trainerscodex] render crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main
        role="alert"
        data-testid="error-boundary"
        className="min-h-screen flex items-center justify-center p-6 font-mono text-foreground bg-background"
      >
        <div className="max-w-md w-full border rounded-lg p-5 space-y-3 bg-card" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="text-[10px] uppercase tracking-widest text-destructive-text">// status: render error</div>
          <h1 className="font-display text-xl text-primary lowercase">something broke</h1>
          <p className="text-xs text-muted-foreground">
            The app hit an error it could not recover from. Reloading usually fixes it.
            If it keeps happening, the saved data on this device is probably the cause —
            resetting removes saved teams, your trainer profile and Journey saves from this browser.
          </p>
          <pre className="text-[10px] text-muted-foreground border rounded p-2 overflow-x-auto max-h-24 [overflow-wrap:anywhere] whitespace-pre-wrap">
            {String(this.state.error.message || this.state.error)}
          </pre>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 h-10 rounded-md border text-xs uppercase tracking-wider hover:border-primary"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              reload
            </button>
            <button
              onClick={resetLocalData}
              data-testid="error-boundary-reset"
              className="flex-1 h-10 rounded-md text-xs uppercase tracking-wider font-bold bg-primary text-primary-foreground hover:opacity-90"
            >
              reset local data
            </button>
          </div>
        </div>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
)

// PWA: register the service worker only on a secure origin. The single-file
// bundle is also used straight from file:// (tests, offline copies) and on
// plain http, where SW registration is unavailable or pointless — guard so
// those paths stay silent instead of throwing.
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
