import { useEffect, useState } from 'react';
import { LogIn, LogOut, Cloud, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { auth, AUTH_PROVIDERS, type AuthSession, type AuthProvider } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface SignInDialogProps {
  open: boolean;
  onClose: () => void;
  session: AuthSession | null;
  onSync?: () => void;
  syncing?: boolean;
  lastSyncAt?: number | null;
}

// Inline SVG provider marks — keeps bundle lean (no extra brand-icons dep)
function ProviderIcon({ id }: { id: AuthProvider }) {
  switch (id) {
    case 'google':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="#fff" d="M21.6 12.227c0-.709-.06-1.39-.18-2.04H12v3.86h5.382a4.6 4.6 0 0 1-1.995 3.018v2.51h3.232c1.89-1.74 2.98-4.305 2.98-7.348Z"/><path fill="#fff" opacity=".9" d="M12 22c2.7 0 4.964-.895 6.62-2.425l-3.233-2.51c-.896.6-2.04.955-3.387.955-2.605 0-4.81-1.76-5.598-4.123H3.067v2.59A9.996 9.996 0 0 0 12 22Z"/><path fill="#fff" opacity=".8" d="M6.402 13.897A5.997 5.997 0 0 1 6.09 12c0-.66.114-1.302.31-1.897V7.513H3.068A9.996 9.996 0 0 0 2 12c0 1.614.386 3.14 1.068 4.487l3.334-2.59Z"/><path fill="#fff" opacity=".7" d="M12 5.977c1.47 0 2.787.505 3.823 1.498l2.868-2.867C16.962 2.99 14.698 2 12 2A9.996 9.996 0 0 0 3.067 7.513l3.335 2.59C7.19 7.737 9.395 5.977 12 5.977Z"/></svg>
      );
    case 'azure':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="#fff" d="M2 3h9.5v9.5H2V3Zm10.5 0H22v9.5h-9.5V3ZM2 13.5h9.5V23H2v-9.5Zm10.5 0H22V23h-9.5v-9.5Z"/></svg>
      );
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="#fff" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89H7.898V12H10.438V9.797c0-2.506 1.492-3.89 3.776-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.629.771-1.629 1.562V12h2.773l-.443 2.89H13.563v6.989C18.343 21.128 22 16.99 22 12Z"/></svg>
      );
    case 'github':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="#fff" d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482v-1.69c-2.782.605-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.907-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.647.35-1.087.636-1.337-2.221-.252-4.555-1.111-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.563 9.563 0 0 1 12 6.844a9.589 9.589 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.337 4.687-4.564 4.935.358.309.679.92.679 1.855v2.75c0 .268.18.578.688.48A10.001 10.001 0 0 0 22 12c0-5.523-4.477-10-10-10Z"/></svg>
      );
    case 'discord':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="#fff" d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.156-1.085-2.156-2.419 0-1.333.955-2.418 2.156-2.418 1.21 0 2.175 1.094 2.156 2.418 0 1.334-.955 2.42-2.156 2.42Zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.42-2.157 2.42Z"/></svg>
      );
    case 'twitter':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="#fff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      );
    case 'apple':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="#fff" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
      );
  }
}

export function SignInDialog({ open, onClose, session, onSync, syncing, lastSyncAt }: SignInDialogProps) {
  const [busyProvider, setBusyProvider] = useState<AuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = auth.isConfigured;

  useEffect(() => {
    if (open) { setBusyProvider(null); setError(null); }
  }, [open]);

  const signIn = async (provider: AuthProvider) => {
    try {
      setBusyProvider(provider);
      setError(null);
      await auth.signInWith(provider);
      // signInWithOAuth redirects in same tab — promise typically never resolves
    } catch (e) {
      setError(e instanceof Error ? e.message : 'sign-in failed');
      setBusyProvider(null);
    }
  };

  const handleSignOut = async () => {
    await auth.signOut();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-xs uppercase tracking-widest flex items-center gap-2">
            {session ? <Cloud size={14} /> : <LogIn size={14} />}
            {session ? 'cloud profile' : 'sign in'}
          </DialogTitle>
          <DialogDescription className="font-mono text-[10px] uppercase tracking-wider">
            {session
              ? '// signed in · cloud sync active'
              : '// optional — sync your trainer profile + saved teams across devices'}
          </DialogDescription>
        </DialogHeader>

        {!configured && !session ? (
          // Setup mode — auth not yet wired
          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2">
              <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                Cloud sign-in is not configured on this deployment. The app is fully usable in
                offline / localStorage mode — sign-in is optional and only needed for
                cross-device sync and abandoned-cart recovery.
              </div>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground space-y-1.5 px-1">
              <div className="font-semibold text-foreground uppercase tracking-wider">// to enable on your deployment</div>
              <div>1. Create a free Supabase project (50K MAU free tier)</div>
              <div>2. Auth → Providers → enable Google / Microsoft / Facebook / GitHub / Discord</div>
              <div>3. Paste credentials into your <code className="text-primary">index.html</code>:</div>
              <pre className="text-[10px] bg-card border border-border rounded p-2 overflow-x-auto">
{`<script>
  window.TRAINERS_CODEX_CONFIG = {
    supabase: {
      url: '...',
      anonKey: '...'
    }
  };
</script>`}
              </pre>
              <div>Full runbook: <code className="text-primary">docs/DEPLOYMENT.md</code></div>
            </div>
          </div>
        ) : session ? (
          // Signed-in view
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-md border bg-card">
              {session.avatarUrl ? (
                <img src={session.avatarUrl} alt={session.name || ''} className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-mono text-xs">
                  {(session.name || session.email || '?')[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm truncate">{session.name || session.email}</div>
                <div className="font-mono text-[10px] text-muted-foreground truncate">
                  via {session.provider}{session.email && session.name ? ` · ${session.email}` : ''}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 flex gap-2">
              <Cloud size={14} className="text-emerald-500 shrink-0 mt-0.5" />
              <div className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                Your trainer profile and saved teams sync automatically.
                {lastSyncAt ? ` Last synced ${formatRelative(lastSyncAt)}.` : ''}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={onSync} disabled={syncing} className="font-mono text-xs">
                {syncing ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Cloud size={12} className="mr-1.5" />}
                {syncing ? 'syncing' : 'sync now'}
              </Button>
              <Button variant="outline" onClick={handleSignOut} className="font-mono text-xs">
                <LogOut size={12} className="mr-1.5" /> sign out
              </Button>
            </div>
          </div>
        ) : (
          // Signed-out provider picker
          <div className="space-y-2">
            {AUTH_PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => signIn(p.id)}
                disabled={busyProvider !== null}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-md border transition text-left',
                  'hover:border-primary/60',
                  busyProvider && busyProvider !== p.id && 'opacity-50'
                )}
                style={{ background: p.accent + '15', borderColor: p.accent + '60' }}
              >
                <div
                  className="w-7 h-7 rounded flex items-center justify-center shrink-0"
                  style={{ background: p.accent }}
                >
                  {busyProvider === p.id
                    ? <Loader2 size={14} className="text-white animate-spin" />
                    : <ProviderIcon id={p.id} />}
                </div>
                <div className="flex-1">
                  <div className="font-mono text-xs font-semibold">Continue with {p.label}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">single-tap secure sign-in</div>
                </div>
              </button>
            ))}
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 font-mono text-[10px] text-red-400">
                {error}
              </div>
            )}
            <Separator className="my-2" />
            <div className="font-mono text-[10px] text-muted-foreground text-center leading-relaxed">
              We never see or store your password. OAuth is handled by your provider.<br />
              <button onClick={onClose} className="underline hover:text-foreground">Skip — keep using offline mode</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
