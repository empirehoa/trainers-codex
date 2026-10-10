import { useState } from 'react';
import { Sparkles, Check, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  getStoredLicense, isWorkerConfigured, redirectToCheckout, verifyServerSideDetailed,
} from '@/lib/license';
import { trackCommerce, type CommerceSurface } from '@/lib/commerce-analytics';
import { cn } from '@/lib/utils';

/** Terms, privacy and the refund policy — one page, linked beside every buy button. */
const LEGAL_URL = '/legal.html';

interface PremiumControlProps {
  /** Whether the user currently has premium unlocked. */
  premium: boolean;
  /** Dev-only preview toggle. Kept for self-host deploys without a worker. */
  onTogglePremium?: () => void;
  /** Render compact (used in dialog headers). */
  compact?: boolean;
  /** Optional pre-fill email for Stripe Checkout. */
  email?: string;
  /** Funnel dimension for checkout_started. */
  surface?: CommerceSurface;
}

/**
 * Single-source-of-truth for premium UI surfaces.
 *
 * Behavior matrix:
 *   premium === true                     → "Premium · active" pill
 *   worker configured + compact          → monthly checkout button + restore /
 *                                          terms links (dialog headers)
 *   worker configured + full             → term picker (annual pre-selected —
 *                                          it's two free months, and annual mix
 *                                          is the churn lever) + checkout button
 *                                          + restore-purchase + terms link. Mounted
 *                                          in the locked-style pitch panels.
 *   worker NOT configured + compact      → Switch (dev/test preview path)
 *   worker NOT configured + full         → "preview unlock" button
 *
 * The dev switch survives in production builds when no worker is configured,
 * so a static-hosted bundle (no API, no Stripe) still has a way to demo the
 * premium UI. Test suites rely on the switch — they load the bundle with no
 * config and exercise the gating UI.
 */
export function PremiumControl({ premium, onTogglePremium, compact, email, surface = 'header' }: PremiumControlProps) {
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // Annual pre-selected: $39/yr vs $59.88 of monthly — "2 months free".
  const [term, setTerm] = useState<'monthly' | 'annual'>('annual');
  const workerOn = isWorkerConfigured();

  const handleCheckout = async (chosen: 'monthly' | 'annual') => {
    setBusy(true);
    trackCommerce({
      event: 'checkout_started', surface, plan: 'premium', term: chosen,
      valueUsd: chosen === 'annual' ? 39 : 4.99,
    });
    try {
      await redirectToCheckout(email, chosen);
      // redirectToCheckout navigates the page; this line only runs if it threw.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'checkout failed');
      setBusy(false);
    }
  };

  // "Restore purchase": re-validate whatever license this browser already
  // holds against /license/verify. True cross-device restore needs an account
  // (cloud sync sign-in); this covers the common case — same browser, cleared
  // UI state, or a user double-checking their subscription is still recognised.
  const handleRestore = async () => {
    setRestoring(true);
    try {
      const stored = getStoredLicense();
      if (!stored) {
        toast('no purchase found in this browser · premium is restored automatically on the browser you bought it in — or sign in to sync');
        return;
      }
      const verdict = await verifyServerSideDetailed(stored.jwt);
      if (verdict === 'invalid') {
        toast.error('this license is no longer active');
      } else {
        toast.success('premium verified · you are all set');
      }
    } finally {
      setRestoring(false);
    }
  };

  if (premium) {
    return (
      <div className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded font-mono text-[10px] uppercase tracking-wider',
        'border border-primary/40 bg-primary/10 text-primary',
      )}>
        <Sparkles size={11} />
        <span>premium · active</span>
      </div>
    );
  }

  if (workerOn) {
    if (compact) {
      // Dialog headers have no room for the term picker; monthly is the
      // low-friction default there and the full picker sits in the locked
      // style's pitch panel. Restore + terms stay one tap away regardless.
      return (
        <div className="flex flex-col items-end gap-1" data-testid="premium-control-compact">
          <Button
            onClick={() => void handleCheckout('monthly')}
            disabled={busy}
            size="sm"
            className="font-mono text-xs"
            data-testid="premium-checkout"
          >
            {busy ? <Loader2 size={11} className="mr-1.5 animate-spin" /> : <Sparkles size={11} className="mr-1.5" />}
            get premium · $4.99/mo
          </Button>
          <div className="font-mono text-[10px] text-muted-foreground flex items-center gap-1.5">
            <button
              onClick={() => void handleRestore()}
              disabled={restoring}
              data-testid="premium-restore-compact"
              className="hover:text-primary"
            >
              {restoring ? 'checking…' : 'restore purchase'}
            </button>
            <span aria-hidden="true">·</span>
            <LegalLink />
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-2" data-testid="premium-control">
        <div className="flex rounded-md border border-border overflow-hidden font-mono text-[10px]"
             role="radiogroup" aria-label="billing term">
          <button
            onClick={() => setTerm('annual')}
            aria-checked={term === 'annual'} role="radio"
            data-testid="premium-term-annual"
            className={cn('flex-1 px-2 py-1.5', term === 'annual' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            annual · $39/yr
            <span className="block text-[10px] opacity-80">2 months free</span>
          </button>
          <button
            onClick={() => setTerm('monthly')}
            aria-checked={term === 'monthly'} role="radio"
            data-testid="premium-term-monthly"
            className={cn('flex-1 px-2 py-1.5', term === 'monthly' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            monthly · $4.99
            <span className="block text-[10px] opacity-80">cancel anytime</span>
          </button>
        </div>
        <Button
          onClick={() => void handleCheckout(term)}
          disabled={busy}
          className="w-full font-mono text-xs"
          data-testid="premium-checkout"
        >
          {busy ? <Loader2 size={11} className="mr-1.5 animate-spin" /> : <Sparkles size={11} className="mr-1.5" />}
          get premium · {term === 'annual' ? '$39/yr' : '$4.99/mo'}
        </Button>
        <button
          onClick={() => void handleRestore()}
          disabled={restoring}
          data-testid="premium-restore"
          className="w-full font-mono text-[10px] text-muted-foreground hover:text-primary flex items-center justify-center gap-1"
        >
          <RotateCcw size={10} /> {restoring ? 'checking…' : 'restore purchase (this browser)'}
        </button>
        <div className="font-mono text-[10px] text-muted-foreground text-center">
          cancel anytime · <LegalLink />
        </div>
      </div>
    );
  }

  // No worker configured — fall back to the preview affordances so the bundle
  // is still demoable on a static host: a switch in headers, a button in the
  // pitch panels (a second switch there would duplicate the header's id).
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Label htmlFor="premium-toggle" className="font-mono text-[10px] text-muted-foreground cursor-pointer">
          premium preview
        </Label>
        <Switch id="premium-toggle" checked={premium} onCheckedChange={onTogglePremium} />
      </div>
    );
  }
  return <PreviewUnlockButton onTogglePremium={onTogglePremium} />;
}

/** "terms & refund policy" — the same link beside every buy button (D-8). */
export function LegalLink({ label = 'terms & refund policy' }: { label?: string }) {
  return (
    <a href={LEGAL_URL} target="_blank" rel="noopener noreferrer"
       className="underline underline-offset-2 hover:text-primary"
       data-testid="premium-legal-link">
      {label}
    </a>
  );
}

function PreviewUnlockButton({ onTogglePremium }: { onTogglePremium?: () => void }) {
  return (
    <Button onClick={onTogglePremium} size="sm" className="font-mono text-xs">
      <Check size={11} className="mr-1.5" /> preview unlock
    </Button>
  );
}

/**
 * Inline "unlock with premium" CTA used inside studio dialogs when a locked
 * style/design is selected. Mirrors PremiumControl's worker-vs-toggle logic
 * but presents as a single primary button.
 */
export function PremiumUnlockCTA({ onTogglePremium, label = 'unlock with premium', email, surface = 'other' }: {
  onTogglePremium?: () => void;
  label?: string;
  email?: string;
  surface?: CommerceSurface;
}) {
  const [busy, setBusy] = useState(false);
  const workerOn = isWorkerConfigured();

  if (workerOn) {
    return (
      <Button
        onClick={async () => {
          setBusy(true);
          trackCommerce({ event: 'checkout_started', surface, plan: 'premium', term: 'monthly', valueUsd: 4.99 });
          try { await redirectToCheckout(email); }
          catch (e) {
            toast.error(e instanceof Error ? e.message : 'checkout failed');
            setBusy(false);
          }
        }}
        disabled={busy}
        size="sm"
        className="font-mono text-xs"
        data-testid="premium-unlock-cta"
      >
        {busy ? <Loader2 size={11} className="mr-1.5 animate-spin" /> : <Sparkles size={11} className="mr-1.5" />}
        {label} · $4.99/mo
      </Button>
    );
  }

  return <PreviewUnlockButton onTogglePremium={onTogglePremium} />;
}
