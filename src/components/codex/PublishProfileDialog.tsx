import { useMemo, useState } from 'react';
import { Check, Copy, Globe, Loader2, LogIn } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { TeamMember, TrainerProfile } from '@/lib/types';
import {
  validateHandle, shapeProfilePayload, shapeTeamPayload, profileUrl,
  type ProfileClient,
} from '@/lib/profiles';

interface PublishProfileDialogProps {
  open: boolean;
  onClose: () => void;
  client: ProfileClient | null;
  /** Signed-in user id; null means the user must sign in first. */
  userId: string | null;
  onRequestSignIn: () => void;
  trainer: TrainerProfile | null;
  teamName: string;
  members: (TeamMember | null)[];
}

export function PublishProfileDialog({
  open, onClose, client, userId, onRequestSignIn, trainer, teamName, members,
}: PublishProfileDialogProps) {
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState(trainer?.catchphrase || '');
  const [includeTeam, setIncludeTeam] = useState(true);
  const [busy, setBusy] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCheck = useMemo(() => validateHandle(handle), [handle]);
  const filledCount = members.filter(Boolean).length;

  const publish = async () => {
    setError(null);
    if (!userId) { onRequestSignIn(); return; }
    if (!client) { setError('Cloud publishing is off for this deployment.'); return; }

    const profileShape = shapeProfilePayload({ userId, handle, trainer, bio, isPublic: true });
    if (!profileShape.ok) { setError(profileShape.error || 'Invalid handle.'); return; }

    setBusy(true);
    const pRes = await client.publishProfile(profileShape.row!);
    if (!pRes.ok) { setBusy(false); setError(pRes.error || 'Could not save your profile.'); return; }

    if (includeTeam && filledCount > 0) {
      const teamShape = shapeTeamPayload({
        ownerId: userId,
        team: { name: teamName, members },
        trainer,
        isPublic: true,
      });
      if (teamShape.ok) await client.publishTeam(teamShape.row!);
    }

    setBusy(false);
    setPublishedUrl(profileUrl(handleCheck.handle || handle));
  };

  const copy = async () => {
    if (!publishedUrl) return;
    try { await navigator.clipboard.writeText(publishedUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard blocked — the URL is shown for manual copy */ }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 bg-card">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="font-display text-lg text-primary lowercase flex items-center gap-2">
            <Globe size={15} /> publish profile
          </DialogTitle>
          <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            // claim a handle · share your trainer + team
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {!userId ? (
            <div className="text-center py-6">
              <LogIn size={24} className="mx-auto text-muted-foreground mb-3" />
              <p className="font-mono text-[11px] text-muted-foreground mb-3">// sign in to claim a public handle.</p>
              <Button size="sm" onClick={onRequestSignIn} className="font-mono text-xs">sign in</Button>
            </div>
          ) : publishedUrl ? (
            <div className="space-y-3">
              <div className="font-mono text-[11px] text-emerald-400">// your profile is live</div>
              <div className="flex gap-2">
                <Input readOnly value={publishedUrl} className="font-mono text-xs text-primary"
                       onClick={(e) => (e.target as HTMLInputElement).select()} />
                <Button variant="outline" onClick={copy} className="font-mono text-xs">
                  {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  <span className="ml-1.5">{copied ? 'copied' : 'copy'}</span>
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={onClose} className="font-mono text-xs">done</Button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">// handle</label>
                <div className="flex items-center gap-1.5 border rounded px-2" style={{ borderColor: 'hsl(var(--border))' }}>
                  <span className="font-mono text-xs text-muted-foreground">/u/</span>
                  <Input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="redfan"
                    className="bg-transparent border-none px-0 h-8 font-mono text-xs focus-visible:ring-0"
                  />
                </div>
                {handle && !handleCheck.ok && (
                  <div className="font-mono text-[10px] text-destructive">{handleCheck.error}</div>
                )}
                {handle && handleCheck.ok && (
                  <div className="font-mono text-[10px] text-emerald-400">// {profileUrl(handleCheck.handle!)}</div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">// bio (max 280)</label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={280}
                  rows={3}
                  placeholder="// tell trainers about your style"
                  className="font-mono text-[11px] resize-none"
                />
              </div>

              <label className="flex items-center gap-2 font-mono text-[11px] cursor-pointer">
                <input type="checkbox" checked={includeTeam} onChange={(e) => setIncludeTeam(e.target.checked)} />
                also publish current team{filledCount > 0 ? ` (${filledCount})` : ' (empty)'}
              </label>

              {error && <div className="font-mono text-[10px] text-destructive">{error}</div>}

              <Button onClick={publish} disabled={busy || !handleCheck.ok} className="w-full font-mono text-xs gap-1.5">
                {busy && <Loader2 size={12} className="animate-spin" />} publish
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
