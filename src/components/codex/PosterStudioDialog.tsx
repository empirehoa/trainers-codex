import { useState, useCallback, useEffect } from 'react';
import { Download, Loader2, Wand2, Lock, Check, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Pokemon, TeamMember, TrainerProfile } from '@/lib/types';
import { ART_STYLES } from '@/lib/constants';
import type { ArtStyle } from '@/lib/constants';
import { buildShareCode } from '@/lib/analysis';
import { renderPoster } from '@/lib/posters';
import { canShareFiles, shareImage } from '@/lib/share';
import { PremiumControl, PremiumUnlockCTA } from './PremiumControl';
import { cn } from '@/lib/utils';

interface PosterStudioDialogProps {
  open: boolean;
  onClose: () => void;
  team: (Pokemon | null)[];
  members: (TeamMember | null)[];
  teamName: string;
  trainer: TrainerProfile | null;
  premium: boolean;
  onTogglePremium: () => void;
}

export function PosterStudioDialog({
  open, onClose, team, members, teamName, trainer, premium, onTogglePremium
}: PosterStudioDialogProps) {
  const [style, setStyle] = useState<ArtStyle>('pixel-crt');
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterBlob, setPosterBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = team.filter(Boolean);
  const code = buildShareCode(members);
  const currentStyleInfo = ART_STYLES.find(s => s.id === style);
  const isLocked = currentStyleInfo?.premium && !premium;

  const generate = useCallback(async () => {
    if (filled.length === 0) return;
    setBusy(true);
    setError(null);
    // Cleanup old URL
    if (posterUrl) URL.revokeObjectURL(posterUrl);
    setPosterUrl(null);
    setPosterBlob(null);
    try {
      const blob = await renderPoster({
        team: members,
        trainer,
        teamName,
        code,
        style,
      });
      setPosterBlob(blob);
      setPosterUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'render failed');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, trainer, teamName, code, style, filled.length]);

  // Auto-generate when style changes or dialog opens
  useEffect(() => {
    if (!open || filled.length === 0 || isLocked) return;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, style, premium]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => { if (posterUrl) URL.revokeObjectURL(posterUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadName = teamName
    ? `${teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${style}.png`
    : `team-${code}-${style}.png`;

  const shareSupported = canShareFiles();
  const sharePoster = useCallback(async () => {
    if (!posterBlob) return;
    const label = teamName ? `"${teamName}"` : 'my team';
    const res = await shareImage({
      blob: posterBlob,
      filename: downloadName,
      title: 'Trainer\'s Codex',
      text: `Built ${label} on Trainer's Codex — build yours at trainerscodex.com`,
    });
    if (res === 'unsupported') toast.error('Sharing not available — download instead.');
  }, [posterBlob, downloadName, teamName]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl p-0 gap-0 max-h-[94dvh] overflow-y-auto scroll-y bg-card">
        <DialogHeader className="px-4 py-3 border-b sticky top-0 bg-card z-10">
          <div className="flex items-center justify-between gap-2">
            <div>
              <DialogTitle className="font-display text-lg text-primary lowercase">
                <Wand2 size={16} className="inline mr-1.5" /> poster studio
              </DialogTitle>
              <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                // {filled.length}/6 mons · 12 art styles · 1080×1350 instagram-ready
              </DialogDescription>
            </div>
            <PremiumControl premium={premium} onTogglePremium={onTogglePremium} compact />
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-0">
          {/* ============== PREVIEW ============== */}
          <div className="p-4 border-r" style={{ borderColor: 'hsl(var(--border))' }}>
            <div
              className="aspect-[4/5] w-full rounded-md border overflow-hidden flex items-center justify-center relative"
              style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted))' }}
            >
              {filled.length === 0 ? (
                <div className="text-center font-mono text-xs text-muted-foreground px-4">
                  // build a team first to generate a poster
                </div>
              ) : isLocked ? (
                <div className="text-center px-4">
                  <Lock size={32} className="mx-auto mb-3 text-primary" />
                  <div className="font-mono text-sm text-foreground mb-1">premium style</div>
                  <div className="font-mono text-[10px] text-muted-foreground mb-4 max-w-xs mx-auto">
                    {currentStyleInfo?.label} · unlock with premium pack ($4.99/mo) for 4 premium styles, 3D HOME sprites, and custom palettes
                  </div>
                  <PremiumUnlockCTA onTogglePremium={onTogglePremium} />
                </div>
              ) : busy ? (
                <div className="text-center">
                  <Loader2 className="animate-spin text-primary mx-auto mb-2" size={28} />
                  <div className="font-mono text-[10px] text-muted-foreground">rendering {currentStyleInfo?.label.toLowerCase()}...</div>
                </div>
              ) : error ? (
                <div className="text-center px-4">
                  <div className="font-mono text-sm text-destructive mb-1">// render failed</div>
                  <div className="font-mono text-[10px] text-muted-foreground mb-3">{error}</div>
                  <Button onClick={generate} size="sm" variant="outline" className="font-mono text-xs">retry</Button>
                </div>
              ) : posterUrl ? (
                <img src={posterUrl} alt={`Team poster · ${style}`} className="w-full h-full object-contain" />
              ) : null}
            </div>

            {posterUrl && !busy && !isLocked && (
              <div className={cn('grid gap-2 mt-3', shareSupported ? 'grid-cols-3' : 'grid-cols-2')}>
                {shareSupported && (
                  <Button onClick={sharePoster} className="font-mono text-xs">
                    <Share2 size={12} className="mr-1.5" /> share
                  </Button>
                )}
                <Button asChild variant={shareSupported ? 'outline' : 'default'}>
                  <a href={posterUrl} download={downloadName} className="font-mono text-xs">
                    <Download size={12} className="mr-1.5" /> download
                  </a>
                </Button>
                <Button variant="outline" onClick={generate} className="font-mono text-xs">
                  <Wand2 size={12} className="mr-1.5" /> regenerate
                </Button>
              </div>
            )}

            <p className="font-mono text-[10px] text-muted-foreground mt-2 text-center">
              {currentStyleInfo?.desc}
            </p>
          </div>

          {/* ============== STYLE PICKER ============== */}
          <div className="p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest mb-2 text-muted-foreground">// art style</div>
            <div className="space-y-1.5">
              {ART_STYLES.map(s => {
                const isPicked = style === s.id;
                const locked = s.premium && !premium;
                return (
                  <button
                    key={s.id}
                    onClick={() => setStyle(s.id)}
                    className={cn(
                      'w-full text-left rounded border p-2.5 transition',
                      isPicked ? 'border-primary' : 'border-border hover:border-primary/50',
                      locked && 'opacity-60'
                    )}
                    style={{ background: isPicked ? 'hsl(var(--primary)/0.1)' : 'transparent' }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-mono text-xs font-semibold">{s.label}</span>
                      {locked && <Lock size={10} className="text-primary shrink-0" />}
                      {!locked && s.premium && (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-primary">PRO</span>
                      )}
                      {isPicked && !locked && <Check size={11} className="text-primary shrink-0" />}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">{s.desc}</div>
                  </button>
                );
              })}
            </div>

            {trainer && (
              <div className="mt-4 p-2 rounded border" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="text-[10px] font-mono uppercase tracking-widest mb-1 text-muted-foreground">// included in poster</div>
                <div className="font-mono text-[11px]">
                  {trainer.name}
                  {trainer.title && <span className="text-muted-foreground"> · {trainer.title}</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-3 border-t bg-background/50">
          <p className="text-[10px] font-mono text-muted-foreground text-center">
            posters are 1080×1350 (4:5) — optimal for instagram & facebook · download as PNG
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
