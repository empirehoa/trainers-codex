import { useState } from 'react';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { isWorkerConfigured, redirectToCheckout } from '@/lib/license';
import { cn } from '@/lib/utils';

interface PremiumControlProps {
  /** Whether the user currently has premium unlocked. */
  premium: boolean;
  /** Dev-only preview toggle. Kept for self-host deploys without a worker. */
  onTogglePremium?: () => void;
  /** Render compact (used in dialog headers). */
  compact?: boolean;
  /** Optional pre-fill email for Stripe Checkout. */
  email?: string;
}

/**
 * Single-source-of-truth for premium UI surfaces.
 *
 * Behavior matrix:
 *   premium === true                     → "Premium · active" pill
 *   worker NOT configured + !premium     → Switch (dev/test preview path)
 *   worker configured + !premium         → "Get Premium" button (Stripe Checkout)
 *
 * The dev switch survives in production builds when no worker is configured,
 * so a static-hosted bundle (no API, no Stripe) still has a way to demo the
 * premium UI. Test suites rely on the switch — they load the bundle with no
 * config and exercise the gating UI.
 */
export function PremiumControl({ premium, onTogglePremium, compact, email }: PremiumControlProps) {
  const [busy, setBusy] = useState(false);
  const workerOn = isWorkerConfigured();

  const handleCheckout = async () => {
    setBusy(true);
    try {
      await redirectToCheckout(email);
      // redirectToCheckout navigates the page; this line only runs if it threw.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'checkout failed');
      setBusy(false);
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
    return (
      <Button
        onClick={handleCheckout}
        disabled={busy}
        size={compact ? 'sm' : 'default'}
        className="font-mono text-xs"
        data-testid="premium-checkout"
      >
        {busy ? <Loader2 size={11} className="mr-1.5 animate-spin" /> : <Sparkles size={11} className="mr-1.5" />}
        get premium · $4.99/mo
      </Button>
    );
  }

  // No worker configured — fall back to the preview toggle so the bundle is
  // still demoable on a static host.
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="premium-toggle" className="font-mono text-[10px] text-muted-foreground cursor-pointer">
        premium preview
      </Label>
      <Switch id="premium-toggle" checked={premium} onCheckedChange={onTogglePremium} />
    </div>
  );
}

/**
 * Inline "unlock with premium" CTA used inside studio dialogs when a locked
 * style/design is selected. Mirrors PremiumControl's worker-vs-toggle logic
 * but presents as a single primary button.
 */
export function PremiumUnlockCTA({ onTogglePremium, label = 'unlock with premium', email }: {
  onTogglePremium?: () => void;
  label?: string;
  email?: string;
}) {
  const [busy, setBusy] = useState(false);
  const workerOn = isWorkerConfigured();

  if (workerOn) {
    return (
      <Button
        onClick={async () => {
          setBusy(true);
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

  return (
    <Button onClick={onTogglePremium} size="sm" className="font-mono text-xs">
      <Check size={11} className="mr-1.5" /> preview unlock
    </Button>
  );
}
