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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Sparkles, Download, Loader2, Upload, AlertTriangle, Lock, X, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import type { TeamMember, TrainerProfile } from '@/lib/types';
import {
  isWorkerConfigured, getStoredLicense, redirectToCheckout,
  getStoredCreditsToken, getCachedCreditBalance, fetchCreditBalance,
  redirectToCreditsCheckout,
} from '@/lib/license';
import { canShareFiles, shareImage, urlToBlob } from '@/lib/share';
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

type Mode = 'trainer-card' | 'team-art' | 'codex-card';

// Style presets mirror worker/src/ai.ts (TRAINER_CARD_STYLES / TEAM_ART_STYLES
// / CARD_STYLES). The worker authors the real prompt text; the client only
// sends the chosen style id. Keep these keys in sync with the worker.
const TRAINER_CARD_STYLES: { id: string; label: string }[] = [
  { id: 'anime', label: 'modern anime' },
  { id: 'retro-90s', label: 'retro 90s anime' },
  { id: 'watercolor', label: 'watercolor' },
  { id: 'synthwave', label: 'synthwave neon' },
  { id: 'storybook', label: 'storybook' },
];
const TEAM_ART_STYLES: { id: string; label: string }[] = [
  { id: 'hyperreal-3d', label: 'hyperreal 3d' },
  { id: 'cinematic', label: 'cinematic poster' },
  { id: 'comic-ink', label: 'comic ink' },
  { id: 'vaporwave', label: 'vaporwave' },
];
const CARD_STYLES: { id: string; label: string }[] = [
  { id: 'classic', label: 'classic' },
  { id: 'full-art', label: 'full art' },
  { id: 'holo', label: 'holo rainbow' },
  { id: 'gold', label: 'gold premium' },
  { id: 'vintage', label: 'vintage' },
  { id: 'neo', label: 'neo burst' },
];

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
  // Style variants per mode.
  const [trainerStyle, setTrainerStyle] = useState('anime');
  const [teamStyle, setTeamStyle] = useState('hyperreal-3d');
  const [cardStyle, setCardStyle] = useState('classic');
  // Codex-card: featured creature (defaults to first team member when present).
  const [cardMon, setCardMon] = useState('');
  // Codex-card custom style: free-text style prompt + optional reference card
  // used ONLY as a style cue (palette/finish/mood). The worker sanitizes the
  // prompt server-side and binds the reference image to a "style only" contract.
  const [cardPrompt, setCardPrompt] = useState('');
  const [referenceBlob, setReferenceBlob] = useState<Blob | null>(null);
  const [referenceDataUrl, setReferenceDataUrl] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<GenerationState>({ status: 'idle' });
  // Credits are a no-subscription path to generation. We track the balance
  // locally (seeded from cache, refreshed from /credits/balance on open) so
  // the UI can entitle a buyer who has credits but no Premium subscription.
  const [creditBalance, setCreditBalance] = useState<number>(() => getCachedCreditBalance());

  const workerOn = isWorkerConfigured();
  // A user may generate when they have Premium OR at least one credit.
  const entitled = premium || creditBalance > 0;

  useEffect(() => {
    if (!open) return;
    setState({ status: 'idle' });
    setMode('trainer-card');
    setConsent(false);
    setCardPrompt('');
    setReferenceBlob(null);
    setReferenceDataUrl(null);
    // Default the featured card creature to the first team member, if any.
    const first = team.find((m): m is TeamMember => !!m);
    setCardMon(first ? (POKEMON_BY_ID[first.id]?.display || '') : '');
    // Re-sync the cached balance (it may have changed since mount), then refresh
    // from the server for the stored credits token, if any.
    if (!premium) {
      setCreditBalance(getCachedCreditBalance());
      const ct = getStoredCreditsToken();
      if (ct) {
        fetchCreditBalance(ct.jwt).then((b) => { if (typeof b === 'number') setCreditBalance(b); });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Optional reference card for codex-card custom style. Downscaled to 768px —
  // it is only a style cue (palette / finish / framing / mood), never copied.
  const handleReference = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Reference must be under 8 MB');
      return;
    }
    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];
    if (!ALLOWED.includes(file.type)) {
      toast.error('Reference must be PNG, JPEG, WebP, or AVIF');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 768;
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
          setReferenceBlob(blob);
          setReferenceDataUrl(canvas.toDataURL('image/jpeg', 0.85));
        }, 'image/jpeg', 0.85);
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
    if (!entitled) {
      toast.error('AI generation requires Premium or credits');
      return;
    }
    if (!consent) {
      toast.error('Please confirm you have the rights to this photo');
      return;
    }
    // Premium uses the license JWT; otherwise spend against the credits token.
    const auth = premium ? getStoredLicense() : getStoredCreditsToken();
    if (!auth) {
      toast.error(premium
        ? 'No active license — sign in or restore from Stripe receipt'
        : 'No credits token — buy a credit pack to generate');
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
      form.append('style', trainerStyle);
    } else if (mode === 'team-art') {
      const teamNames = team
        .filter((m): m is TeamMember => !!m)
        .map(m => POKEMON_BY_ID[m.id]?.display)
        .filter(Boolean)
        .slice(0, 6);
      form.append('team', JSON.stringify(teamNames));
      form.append('style', teamStyle);
    } else {
      form.append('name', (trainer?.name || 'Trainer').slice(0, 24));
      form.append('cardStyle', cardStyle);
      if (cardMon) form.append('mon', cardMon.slice(0, 40));
      if (cardPrompt.trim()) form.append('prompt', cardPrompt.trim().slice(0, 280));
      if (referenceBlob) form.append('reference', referenceBlob, 'reference.jpg');
    }

    setState({ status: 'generating' });

    try {
      const workerUrl = (window as { TRAINERS_CODEX_CONFIG?: { worker?: { url?: string } } })
        .TRAINERS_CODEX_CONFIG?.worker?.url;
      const resp = await fetch(`${workerUrl}/ai/${mode}`, {
        method: 'POST',
        headers: { 'authorization': `Bearer ${auth.jwt}` },
        body: form,
      });
      if (!resp.ok) {
        const errText = await resp.text();
        let errCode = 'generation_failed';
        try { errCode = JSON.parse(errText).error || errCode; } catch {}
        const MESSAGES: Record<string, string> = {
          ai_not_configured: 'AI image generation is not yet configured on this deploy. Try again in a few minutes.',
          quota_exhausted: 'Monthly quota exhausted — resets on the 1st.',
          no_credits: 'Out of credits — buy a credit pack to keep generating.',
          premium_required: 'Premium subscription required for AI generation.',
          plan_mismatch: 'This token can\'t be used for AI generation. Buy credits or get Premium.',
          license_required: 'No active license — sign in or restore from your Stripe receipt.',
          token_required: 'No active license or credits — get Premium or buy a credit pack.',
          photo_required: 'Upload a photo first.',
          photo_too_large: 'Photo must be under 8 MB.',
          reference_too_large: 'Reference image must be under 8 MB.',
          image_rejected: "This photo was flagged by our safety check and can't be used. Please try a different photo.",
          moderation_unavailable: 'Safety check is temporarily unavailable. Please try again in a moment.',
          rate_limited: 'Too many requests — please wait a minute and try again.',
        };
        // A spent/empty credits balance: reflect it so the UI re-gates.
        if (!premium && (errCode === 'no_credits')) setCreditBalance(0);
        throw new Error(MESSAGES[errCode] || errCode.replace(/_/g, ' '));
      }
      const data = await resp.json() as { imageUrl: string; quotaRemaining: number };
      setState({ status: 'done', imageUrl: data.imageUrl, quotaRemaining: data.quotaRemaining });
      // For the credits path, quotaRemaining is the new balance — track it.
      if (!premium) setCreditBalance(data.quotaRemaining);
      toast.success(premium
        ? `Generated! ${data.quotaRemaining} / 5 left this month`
        : `Generated! ${data.quotaRemaining} credit${data.quotaRemaining === 1 ? '' : 's'} left`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'generation failed';
      setState({ status: 'error', error: msg });
    }
  }, [photoBlob, premium, entitled, consent, mode, trainer, year, vibe, starter, team, trainerStyle, teamStyle, cardStyle, cardMon, cardPrompt, referenceBlob]);

  const fillType = team.filter(Boolean).length;
  const canGenerate = !!photoBlob && (mode !== 'team-art' || fillType > 0);

  const shareSupported = canShareFiles();
  const shareGenerated = useCallback(async () => {
    if (!state.imageUrl) return;
    const blob = await urlToBlob(state.imageUrl);
    if (!blob) {
      toast.error('Could not prepare the image to share — download it instead.');
      return;
    }
    const res = await shareImage({
      blob,
      filename: `trainerscodex-${mode}.png`,
      title: "Trainer's Codex",
      text: "Made with Trainer's Codex AI Studio — trainerscodex.com",
    });
    if (res === 'unsupported') toast.error('Sharing not available — download instead.');
  }, [state.imageUrl, mode]);

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
              // photo → trainer card · team portrait · collectible card · premium
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

        {/* Premium users see nothing here — they're entitled via monthly quota. */}
        {!premium && creditBalance > 0 && (
          <div className="m-4 rounded-md border border-primary/30 bg-primary/5 p-3 flex items-center gap-2" data-testid="ai-credit-balance">
            <Sparkles size={14} className="text-primary shrink-0" />
            <div className="flex-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
              <span className="text-primary font-bold">{creditBalance}</span> AI {creditBalance === 1 ? 'credit' : 'credits'} available — each generation uses one.
            </div>
            {workerOn && (
              <Button
                onClick={() => redirectToCreditsCheckout('five').catch(e => toast.error(e instanceof Error ? e.message : 'checkout failed'))}
                size="sm"
                variant="outline"
                className="font-mono text-xs"
              >
                buy more
              </Button>
            )}
          </div>
        )}

        {!premium && creditBalance === 0 && (
          <div className="m-4 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3" data-testid="ai-paywall">
            <div className="flex items-start gap-2">
              <Lock size={14} className="text-primary shrink-0 mt-0.5" />
              <div className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                AI generation needs credits or Premium. Buy a one-time pack — no subscription —
                or go Premium for monthly generations.
              </div>
            </div>

            {workerOn ? (
              <>
                <div className="grid grid-cols-3 gap-2" data-testid="ai-credit-packs">
                  {([
                    { pack: 'single' as const, credits: '1', price: '$1.99' },
                    { pack: 'five' as const,   credits: '5', price: '$6.99', tag: 'popular' },
                    { pack: 'twenty' as const, credits: '20', price: '$19.99', tag: 'best value' },
                  ]).map(p => (
                    <button
                      key={p.pack}
                      type="button"
                      data-testid={`ai-buy-${p.pack}`}
                      onClick={() => redirectToCreditsCheckout(p.pack).catch(e => toast.error(e instanceof Error ? e.message : 'checkout failed'))}
                      className="relative rounded-md border border-border bg-card hover:border-primary hover:bg-primary/5 transition px-2 py-3 flex flex-col items-center gap-0.5"
                    >
                      {p.tag && (
                        <span className="absolute -top-2 right-1 text-[8px] font-mono uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                          {p.tag}
                        </span>
                      )}
                      <span className="font-display text-lg text-primary leading-none">{p.credits}</span>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{p.credits === '1' ? 'credit' : 'credits'}</span>
                      <span className="font-mono text-xs mt-1">{p.price}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 h-px bg-border" />
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">or go premium</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => redirectToCheckout(undefined, 'monthly').catch(e => toast.error(e instanceof Error ? e.message : 'checkout failed'))}
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs"
                    data-testid="ai-premium-monthly"
                  >
                    <Sparkles size={11} className="mr-1.5" /> $4.99/mo
                  </Button>
                  <Button
                    onClick={() => redirectToCheckout(undefined, 'annual').catch(e => toast.error(e instanceof Error ? e.message : 'checkout failed'))}
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs"
                    data-testid="ai-premium-annual"
                  >
                    <Sparkles size={11} className="mr-1.5" /> $39/yr
                  </Button>
                </div>
                <p className="font-mono text-[9px] text-muted-foreground text-center leading-relaxed">
                  Premium = 5 generations per kind every month + all premium poster &amp; merch designs.
                </p>
              </>
            ) : (
              <Button onClick={onTogglePremium} size="sm" variant="outline" className="font-mono text-xs w-full">
                preview unlock
              </Button>
            )}
          </div>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full">
          <TabsList className="grid grid-cols-3 mx-4 mt-4 bg-muted">
            <TabsTrigger value="trainer-card" className="font-mono text-[10px] uppercase">
              trainer card
            </TabsTrigger>
            <TabsTrigger value="team-art" className="font-mono text-[10px] uppercase">
              team art
            </TabsTrigger>
            <TabsTrigger value="codex-card" className="font-mono text-[10px] uppercase">
              codex card
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
                Photo is resized client-side to 1024×1024, screened by an automated safety check,
                then used only to generate your image. Uploads are auto-deleted within 24 hours.
              </p>
            </div>

            {/* ============== MODE-SPECIFIC FIELDS ============== */}
            <div>
              <TabsContent value="trainer-card" className="m-0 space-y-3">
                <div>
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 block">
                    // art style
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TRAINER_CARD_STYLES.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setTrainerStyle(s.id)}
                        className={cn(
                          'font-mono text-[10px] px-2.5 py-1.5 rounded border transition',
                          trainerStyle === s.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50 text-muted-foreground'
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

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
                <div>
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 block">
                    // art style
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TEAM_ART_STYLES.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setTeamStyle(s.id)}
                        className={cn(
                          'font-mono text-[10px] px-2.5 py-1.5 rounded border transition',
                          teamStyle === s.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50 text-muted-foreground'
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

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
                  Generates a hero team portrait: you in the center in an anime-protagonist pose
                  holding a Poké Ball, your team surrounding you (smaller), low-angle dominant
                  composition, rendered in your chosen style. 3:4 aspect ratio.
                </p>
              </TabsContent>

              <TabsContent value="codex-card" className="m-0 space-y-3">
                <div>
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 block">
                    // card finish
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {CARD_STYLES.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setCardStyle(s.id)}
                        className={cn(
                          'font-mono text-[10px] px-2.5 py-1.5 rounded border transition',
                          cardStyle === s.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50 text-muted-foreground'
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="ai-card-mon" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                    // featured creature (optional)
                  </Label>
                  {fillType > 0 ? (
                    <Select value={cardMon || '_none'} onValueChange={(v) => setCardMon(v === '_none' ? '' : v)}>
                      <SelectTrigger className="font-mono text-xs"><SelectValue placeholder="none" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none" className="font-mono text-xs">— none —</SelectItem>
                        {team.filter((m): m is TeamMember => !!m).map((m, i) => {
                          const name = POKEMON_BY_ID[m.id]?.display || `#${m.id}`;
                          return (
                            <SelectItem key={i} value={name} className="font-mono text-xs">{name}</SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="ai-card-mon"
                      value={cardMon}
                      onChange={(e) => setCardMon(e.target.value.slice(0, 40))}
                      placeholder="optional — a creature to feature"
                      className="font-mono text-xs"
                    />
                  )}
                  <p className="text-[10px] font-mono text-muted-foreground mt-1">
                    Adds an original creature alongside you on the card. Leave empty for a solo card.
                  </p>
                </div>

                <div>
                  <Label htmlFor="ai-card-prompt" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                    // your style (optional)
                  </Label>
                  <textarea
                    id="ai-card-prompt"
                    data-testid="codex-card-prompt"
                    value={cardPrompt}
                    onChange={(e) => setCardPrompt(e.target.value.slice(0, 280))}
                    placeholder="describe the look you want — e.g. 'moody neon cyberpunk, teal & magenta, rain-slick chrome frame'"
                    rows={3}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] font-mono text-muted-foreground mt-1 text-right">
                    {cardPrompt.length}/280
                  </p>
                </div>

                <div>
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 block">
                    // style reference (optional)
                  </Label>
                  <div className="flex gap-2">
                    <label
                      htmlFor="ai-reference-upload"
                      data-testid="codex-card-reference"
                      className={cn(
                        'flex-1 rounded-md border-2 border-dashed cursor-pointer transition relative overflow-hidden flex items-center justify-center',
                        referenceDataUrl ? 'border-primary h-28' : 'border-border hover:border-primary/60 h-16'
                      )}
                      style={{ background: 'hsl(var(--muted))' }}
                    >
                      <input
                        id="ai-reference-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        onChange={handleReference}
                        className="hidden"
                      />
                      {referenceDataUrl ? (
                        <img src={referenceDataUrl} alt="" className="h-full w-auto object-contain" />
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Upload size={16} />
                          <span className="font-mono text-[10px]">drop a card whose look you love</span>
                        </div>
                      )}
                    </label>
                    {referenceDataUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setReferenceBlob(null); setReferenceDataUrl(null); }}
                        className="font-mono text-[10px] self-start"
                      >
                        <X size={11} className="mr-1" /> clear
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] font-mono text-muted-foreground mt-1.5 leading-relaxed">
                    Used only as a <span className="text-primary">style cue</span> — palette, finish,
                    framing, and mood. We never copy the original character, logos, or layout. Your
                    card is generated fresh from your photo as 100% original art.
                  </p>
                </div>

                <p className="text-[10px] font-mono text-muted-foreground leading-relaxed pt-2">
                  Turns your photo into an original, printable collectible card — your name on the
                  banner, a stat strip, and the finish you pick. Fully original art and frame (no
                  official TCG layouts or logos). 3:4 print-ready aspect ratio.
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
              <div className={cn('grid gap-2 mt-3', shareSupported ? 'grid-cols-3' : 'grid-cols-2')}>
                {shareSupported && (
                  <Button onClick={shareGenerated} className="font-mono text-xs">
                    <Share2 size={12} className="mr-1.5" /> share
                  </Button>
                )}
                <Button asChild variant={shareSupported ? 'outline' : 'default'} className="font-mono text-xs">
                  <a href={state.imageUrl} download={`trainerscodex-${mode}.png`}>
                    <Download size={12} className="mr-1.5" /> download
                  </a>
                </Button>
                <Button variant="outline" onClick={() => setState({ status: 'idle' })} className="font-mono text-xs">
                  <Sparkles size={12} className="mr-1.5" /> again
                </Button>
              </div>
              {typeof state.quotaRemaining === 'number' && (
                <p className="font-mono text-[10px] text-muted-foreground mt-2 text-center">
                  {premium
                    ? `${state.quotaRemaining} / 5 generations remaining this month`
                    : `${state.quotaRemaining} credit${state.quotaRemaining === 1 ? '' : 's'} remaining`}
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
            <div className="p-4 space-y-3">
              <label
                htmlFor="ai-consent"
                className="flex items-start gap-2 cursor-pointer rounded-md border border-border bg-background/50 p-2.5"
              >
                <Checkbox
                  id="ai-consent"
                  checked={consent}
                  onCheckedChange={(c) => setConsent(c === true)}
                  className="mt-0.5"
                />
                <span className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                  I confirm this photo is of me, or I have the consent and rights to use it.
                  I won't upload photos of others without permission, copyrighted images, or
                  unlawful content, and I accept the{' '}
                  <a href="/legal.html" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    Terms
                  </a>.
                </span>
              </label>
              <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 font-mono text-xs"
              >
                cancel
              </Button>
              <Button
                onClick={generate}
                disabled={!canGenerate || !entitled || !consent || !workerOn || state.status === 'uploading' || state.status === 'generating'}
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
