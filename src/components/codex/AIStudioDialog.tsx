// v6 — AI Studio: generates trainer cards + team art from a user photo
// by calling the Worker /ai/trainer-card and /ai/team-art routes.
//
// Premium-gated. Falls back to a clear "needs setup" state when the worker
// URL is unconfigured or when the user isn't licensed.
//
// Prompts are templated server-side (see worker/src/ai.ts) — we send only
// the structured params + photo blob.

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Sparkles, Download, Loader2, Upload, AlertTriangle, Lock, X } from 'lucide-react';
import { toast } from 'sonner';
import type { TeamMember, TrainerProfile } from '@/lib/types';
import {
  isWorkerConfigured, getStoredLicense, redirectToCheckout,
} from '@/lib/license';
import { POKEMON_BY_ID } from '@/lib/pokemon';
import { cn } from '@/lib/utils';

interface AIStudioDialogProps {
  open: boolean;
  onClose: () => void;
  trainer: TrainerProfile | null;
  team: (TeamMember | null)[];
  premium: boolean;
  onTogglePremium?: () => void;
}

type Mode = 'trainer-card' | 'team-art';

interface GenerationState {
  status: 'idle' | 'uploading' | 'generating' | 'done' | 'error';
  imageUrl?: string;
  error?: string;
  quotaRemaining?: number;
}

export function AIStudioDialog({
  open, onClose, trainer, team, premium, onTogglePremium,
}: AIStudioDialogProps) {
  const [mode, setMode] = useState<Mode>('trainer-card');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [vibe, setVibe] = useState<'calm' | 'chaotic' | 'balanced'>('balanced');
  const [starter, setStarter] = useState<'grass' | 'fire' | 'water'>('fire');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [state, setState] = useState<GenerationState>({ status: 'idle' });

  const workerOn = isWorkerConfigured();

  useEffect(() => {
    if (!open) return;
    setState({ status: 'idle' });
    setMode('trainer-card');
  }, [open]);

  const handlePhoto = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Photo must be under 8 MB');
      return;
    }
    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];
    if (!ALLOWED.includes(file.type)) {
      toast.error('Photo must be PNG, JPEG, WebP, or AVIF');
      return;
    }
    // Downscale to max 1024×1024 client-side to keep upload fast.
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1024;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) return;
          setPhotoBlob(blob);
          setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.88));
        }, 'image/jpeg', 0.88);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const generate = useCallback(async () => {
    if (!photoBlob) {
      toast.error('Upload a photo first');
      return;
    }
    if (!premium) {
      toast.error('AI generation requires Premium');
      return;
    }
    const license = getStoredLicense();
    if (!license) {
      toast.error('No active license — sign in or restore from Stripe receipt');
      return;
    }

    setState({ status: 'uploading' });
    const form = new FormData();
    form.append('photo', photoBlob, 'photo.jpg');

    if (mode === 'trainer-card') {
      form.append('name', (trainer?.name || 'Trainer').slice(0, 24));
      form.append('year', year);
      form.append('vibe', vibe);
      form.append('starter', starter);
    } else {
      const teamNames = team
        .filter((m): m is TeamMember => !!m)
        .map(m => POKEMON_BY_ID[m.id]?.display)
        .filter(Boolean)
        .slice(0, 6);
      form.append('team', JSON.stringify(teamNames));
    }

    setState({ status: 'generating' });

    try {
      const workerUrl = (window as { TRAINERS_CODEX_CONFIG?: { worker?: { url?: string } } })
        .TRAINERS_CODEX_CONFIG?.worker?.url;
      const resp = await fetch(`${workerUrl}/ai/${mode}`, {
        method: 'POST',
        headers: { 'authorization': `Bearer ${license.jwt}` },
        body: form,
      });
      if (!resp.ok) {
        const errText = await resp.text();
        let errCode = 'generation_failed';
        try { errCode = JSON.parse(errText).error || errCode; } catch {}
        if (errCode === 'ai_not_configured') {
          throw new Error('AI image generation is not yet configured on this deploy. Try again in a few minutes.');
        }
        if (errCode === 'quota_exhausted') {
          throw new Error('Monthly quota exhausted — resets on the 1st.');
        }
        if (errCode === 'premium_required') {
          throw new Error('Premium subscription required for AI generation.');
        }
        throw new Error(errCode.replace(/_/g, ' '));
      }
      const data = await resp.json() as { imageUrl: string; quotaRemaining: number };
      setState({ status: 'done', imageUrl: data.imageUrl, quotaRemaining: data.quotaRemaining });
      toast.success('Generated! Quota remaining: ' + data.quotaRemaining);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'generation failed';
      setState({ status: 'error', error: msg });
    }
  }, [photoBlob, premium, mode, trainer, year, vibe, starter, team]);

  const fillType = team.filter(Boolean).length;
  const canGenerate = !!photoBlob && (mode === 'trainer-card' || fillType > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[94vh] overflow-y-auto scroll-y bg-card">
        <DialogHeader className="px-4 py-3 border-b sticky top-0 bg-card z-10">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-2 right-2 w-9 h-9 rounded-md border border-border bg-card flex items-center justify-center hover:bg-muted active:scale-95 transition z-20"
          >
            <X size={16} />
          </button>
          <div className="pr-10">
            <DialogTitle className="font-display text-lg text-primary lowercase">
              <Sparkles size={16} className="inline mr-1.5" /> ai studio
            </DialogTitle>
            <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              // photo → anime trainer card · or hyperreal 3d team portrait · premium
            </DialogDescription>
          </div>
        </DialogHeader>

        {!workerOn && (
          <div className="m-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="font-mono text-[10px] leading-relaxed text-muted-foreground">
              AI Studio requires the Cloudflare Worker to be deployed with a fal.ai API key.
              Run <code className="text-primary">./scripts/deploy.sh</code> and set <code className="text-primary">FAL_API_KEY</code> as a Worker secret to enable.
              <br />Documented in <code className="text-primary">docs/v6-PLAN.md</code> § B1.
            </div>
          </div>
        )}

        {!premium && (
          <div className="m-4 rounded-md border border-primary/30 bg-primary/5 p-3 flex items-center gap-2">
            <Lock size={14} className="text-primary shrink-0" />
            <div className="flex-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
              AI generation is a Premium Pack feature ($4.99/mo, 5 generations per kind per month included).
            </div>
            {workerOn ? (
              <Button
                onClick={() => redirectToCheckout().catch(e => toast.error(e instanceof Error ? e.message : 'checkout failed'))}
                size="sm"
                className="font-mono text-xs"
              >
                <Sparkles size={11} className="mr-1.5" /> get premium
              </Button>
            ) : (
              <Button onClick={onTogglePremium} size="sm" variant="outline" className="font-mono text-xs">
                preview unlock
              </Button>
            )}
          </div>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full">
          <TabsList className="grid grid-cols-2 mx-4 mt-4 bg-muted">
            <TabsTrigger value="trainer-card" className="font-mono text-[10px] uppercase">
              trainer card · @kingbulljs
            </TabsTrigger>
            <TabsTrigger value="team-art" className="font-mono text-[10px] uppercase">
              team art · @roblogs
            </TabsTrigger>
          </TabsList>

          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 p-4">
            {/* ============== PHOTO UPLOAD ============== */}
            <div>
              <Label className="text-[10px] font-mono uppercase tracking-widest mb-2 block text-muted-foreground">
                // your photo
              </Label>
              <label
                htmlFor="ai-photo-upload"
                className={cn(
                  'block aspect-square w-full rounded-md border-2 border-dashed cursor-pointer transition relative overflow-hidden',
                  photoDataUrl ? 'border-primary' : 'border-border hover:border-primary/60'
                )}
                style={{ background: 'hsl(var(--muted))' }}
              >
                <input
                  id="ai-photo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  onChange={handlePhoto}
                  className="hidden"
                />
                {photoDataUrl ? (
                  <img src={photoDataUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                    <Upload size={28} className="mb-2" />
                    <span className="font-mono text-xs">click to upload</span>
                    <span className="font-mono text-[10px] mt-1">PNG · JPEG · WebP · 8 MB max</span>
                  </div>
                )}
              </label>
              <p className="text-[10px] font-mono text-muted-foreground mt-2 leading-relaxed">
                Photo is resized client-side to 1024×1024 then uploaded to your Worker's R2 bucket
                for fal.ai to fetch. R2 storage is 24-hour TTL.
              </p>
            </div>

            {/* ============== MODE-SPECIFIC FIELDS ============== */}
            <div>
              <TabsContent value="trainer-card" className="m-0 space-y-3">
                <div>
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                    // first partner type
                  </Label>
                  <Select value={starter} onValueChange={(v) => setStarter(v as typeof starter)}>
                    <SelectTrigger className="font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grass" className="font-mono text-xs">🌱 Grass starter</SelectItem>
                      <SelectItem value="fire"  className="font-mono text-xs">🔥 Fire starter</SelectItem>
                      <SelectItem value="water" className="font-mono text-xs">💧 Water starter</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">
                    The final evolution of this starter will also appear in your generated 6-mon team.
                  </p>
                </div>

                <div>
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                    // vibe (affects System Control rating)
                  </Label>
                  <Select value={vibe} onValueChange={(v) => setVibe(v as typeof vibe)}>
                    <SelectTrigger className="font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="calm" className="font-mono text-xs">calm / structured · high control</SelectItem>
                      <SelectItem value="balanced" className="font-mono text-xs">balanced</SelectItem>
                      <SelectItem value="chaotic" className="font-mono text-xs">expressive / chaotic · low control</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="ai-year" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                    // joined year
                  </Label>
                  <Input
                    id="ai-year"
                    value={year}
                    onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                    className="font-mono text-xs"
                  />
                </div>

                <p className="text-[10px] font-mono text-muted-foreground leading-relaxed pt-2">
                  Generates an anime-style trainer card preserving your face. Includes 6-mon team
                  with 1 Mega Evolution, capture balls, signature moves, trainer stats, and a
                  "System Control" rating tuned to your chosen vibe.
                </p>
              </TabsContent>

              <TabsContent value="team-art" className="m-0 space-y-3">
                <div className="rounded-md border bg-background/50 p-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                    // featured mons (auto from team)
                  </div>
                  {fillType === 0 ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      Add at least one Pokémon to your team to include them in the generated art.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {team.filter((m): m is TeamMember => !!m).map((m, i) => (
                        <span key={i} className="text-[10px] font-mono px-2 py-1 rounded border border-border bg-card">
                          {POKEMON_BY_ID[m.id]?.display || `#${m.id}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                  Generates a hyperrealistic 3D team portrait: you in the center in an anime-protagonist
                  pose holding a Poké Ball, your mons surrounding you (smaller), low-angle dominant
                  composition, cold tones + cinematic lighting. 3:4 aspect ratio.
                </p>
              </TabsContent>
            </div>
          </div>
        </Tabs>

        {/* ============== RESULT / ACTION BAR ============== */}
        <div className="border-t bg-background/50">
          {state.status === 'done' && state.imageUrl && (
            <div className="p-4">
              <div className="rounded-md border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                <img src={state.imageUrl} alt="Generated" className="w-full h-auto" />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Button asChild className="font-mono text-xs">
                  <a href={state.imageUrl} download={`trainerscodex-${mode}.png`}>
                    <Download size={12} className="mr-1.5" /> download PNG
                  </a>
                </Button>
                <Button variant="outline" onClick={() => setState({ status: 'idle' })} className="font-mono text-xs">
                  <Sparkles size={12} className="mr-1.5" /> generate another
                </Button>
              </div>
              {typeof state.quotaRemaining === 'number' && (
                <p className="font-mono text-[10px] text-muted-foreground mt-2 text-center">
                  {state.quotaRemaining} / 5 generations remaining this month
                </p>
              )}
            </div>
          )}

          {state.status === 'error' && (
            <div className="p-4 rounded-md border border-red-500/30 bg-red-500/5 m-4 font-mono text-xs text-red-400">
              {state.error}
            </div>
          )}

          {state.status !== 'done' && (
            <div className="p-4 flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 font-mono text-xs"
              >
                cancel
              </Button>
              <Button
                onClick={generate}
                disabled={!canGenerate || !premium || !workerOn || state.status === 'uploading' || state.status === 'generating'}
                className="flex-1 font-mono text-xs"
              >
                {state.status === 'uploading' ? (
                  <><Loader2 size={12} className="mr-1.5 animate-spin" /> uploading…</>
                ) : state.status === 'generating' ? (
                  <><Loader2 size={12} className="mr-1.5 animate-spin" /> generating · 15-30s…</>
                ) : (
                  <><Sparkles size={12} className="mr-1.5" /> generate</>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
