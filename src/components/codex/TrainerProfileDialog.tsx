import { useState, useRef, useEffect } from 'react';
import { User, Camera, Upload, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { TrainerProfile, PokemonType } from '@/lib/types';
import { TYPES, TYPE_COLORS, TRAINER_AVATARS, GENERATIONS } from '@/lib/constants';
import { POKEMON_BY_ID, pixelSprite } from '@/lib/pokemon';
import { TypePill } from './TypePill';
import { cn } from '@/lib/utils';

interface TrainerProfileDialogProps {
  open: boolean;
  onClose: () => void;
  trainer: TrainerProfile | null;
  onSave: (next: TrainerProfile) => void;
}

const ICON_AVATARS: Record<string, { color: string; emoji: string }> = {
  'cap-red':    { color: '#e62829', emoji: '🧢' },
  'cap-blue':   { color: '#2980ef', emoji: '🧢' },
  'cap-purple': { color: '#9141cb', emoji: '🧢' },
  'rocket':     { color: '#624d4e', emoji: '🚀' },
};

const NONE = '_none';
const TITLES = [
  NONE,
  'Casual Trainer',
  'Battle Veteran',
  'Champion',
  'Gym Leader',
  'Elite Four',
  'Coordinator',
  'Ranger',
  'Breeder',
  'Researcher',
  'Collector',
];

export function TrainerProfileDialog({ open, onClose, trainer, onSave }: TrainerProfileDialogProps) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [region, setRegion] = useState('');
  const [avatarId, setAvatarId] = useState('pikachu');
  const [customAvatar, setCustomAvatar] = useState<string | undefined>();
  const [motto, setMotto] = useState('');
  const [favoriteType, setFavoriteType] = useState<PokemonType | ''>('');
  const [signatureId, setSignatureId] = useState<number | undefined>();
  const [sigSearch, setSigSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(trainer?.name ?? '');
    setTitle(trainer?.title ?? '');
    setRegion(trainer?.region ?? '');
    setAvatarId(trainer?.avatarId ?? 'pikachu');
    setCustomAvatar(trainer?.customAvatarDataUrl);
    setMotto(trainer?.motto ?? '');
    setFavoriteType((trainer?.favoriteType ?? '') as PokemonType | '');
    setSignatureId(trainer?.signaturePokemonId);
    setSigSearch('');
  }, [open, trainer]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB');
      return;
    }
    // Defense-in-depth: the accept="image/*" attribute on the <input> is
    // advisory only. Explicitly allow-list the MIME types we know the
    // downstream canvas decoder + webp re-encoder can handle. SVG is
    // excluded because XML-in-SVG can host script payloads when treated
    // as an image-element source (img tags don't run scripts, but data:
    // URIs round-tripped through other surfaces can).
    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
    if (!ALLOWED.includes(file.type)) {
      alert('Image must be PNG, JPEG, WebP, GIF, or AVIF.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // Resize to 256×256 in a canvas to keep storage small
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const minD = Math.min(img.width, img.height);
        const sx = (img.width - minD) / 2;
        const sy = (img.height - minD) / 2;
        ctx.drawImage(img, sx, sy, minD, minD, 0, 0, 256, 256);
        setCustomAvatar(canvas.toDataURL('image/webp', 0.82));
        setAvatarId('custom');
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const next: TrainerProfile = {
      name: name.trim() || 'Trainer',
      title: title || undefined,
      region: region || undefined,
      avatarId: avatarId || 'pikachu',
      customAvatarDataUrl: customAvatar,
      motto: motto.trim() || undefined,
      favoriteType: (favoriteType as PokemonType) || undefined,
      signaturePokemonId: signatureId,
    };
    onSave(next);
    onClose();
  };

  const filteredPokemon = sigSearch.trim()
    ? Object.values(POKEMON_BY_ID).filter(p =>
        p.name.includes(sigSearch.toLowerCase().trim()) ||
        String(p.id) === sigSearch.trim()
      ).slice(0, 18)
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[92dvh] overflow-y-auto scroll-y bg-card">
        <DialogHeader className="px-4 py-3 border-b sticky top-0 bg-card z-10">
          <DialogTitle className="font-display text-lg text-primary lowercase">trainer profile</DialogTitle>
          <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            // identity for posters, exports & shared teams
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-5">
          {/* Avatar */}
          <section>
            <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">
              // avatar
            </Label>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 mb-2">
              {TRAINER_AVATARS.map(av => {
                const isPicked = avatarId === av.id;
                let preview;
                if (av.kind === 'pokemon') {
                  preview = (
                    <img src={pixelSprite(av.ref as number)} alt={av.label}
                         className="pixel-img w-full h-full object-contain" loading="lazy" />
                  );
                } else {
                  const ic = ICON_AVATARS[av.id];
                  preview = (
                    <div className="w-full h-full flex items-center justify-center text-lg"
                         style={{ background: (ic?.color || '#000') + '33' }}>
                      {ic?.emoji || '?'}
                    </div>
                  );
                }
                return (
                  <button
                    key={av.id}
                    onClick={() => { setAvatarId(av.id); setCustomAvatar(undefined); }}
                    className={cn(
                      'aspect-square rounded border transition',
                      isPicked ? 'border-primary' : 'border-border hover:border-primary/50'
                    )}
                    style={{ background: isPicked ? 'hsl(var(--primary)/0.1)' : 'hsl(var(--card))' }}
                    title={av.label}
                  >
                    {preview}
                  </button>
                );
              })}
              {/* Custom upload tile */}
              <button
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'aspect-square rounded border transition flex items-center justify-center',
                  avatarId === 'custom' ? 'border-primary' : 'border-dashed border-border hover:border-primary/50'
                )}
                title="Upload"
              >
                {customAvatar
                  ? <img src={customAvatar} alt="Custom" className="w-full h-full object-cover rounded" />
                  : <Camera size={14} className="text-muted-foreground" />}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}
                      className="text-[10px] font-mono">
                <Upload size={10} className="mr-1" /> upload photo
              </Button>
              {customAvatar && (
                <Button variant="ghost" size="sm" onClick={() => { setCustomAvatar(undefined); setAvatarId('pikachu'); }}
                        className="text-[10px] font-mono text-muted-foreground hover:text-destructive">
                  <Trash2 size={10} className="mr-1" /> remove
                </Button>
              )}
            </div>
          </section>

          <Separator />

          {/* Name + Title */}
          <section className="space-y-3">
            <div>
              <Label htmlFor="trainer-name" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                // name
              </Label>
              <Input
                id="trainer-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Red, Blue, Jose..."
                maxLength={20}
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="trainer-title" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                  // title
                </Label>
                <Select value={title || NONE} onValueChange={(v) => setTitle(v === NONE ? '' : v)}>
                  <SelectTrigger className="font-mono text-xs">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {TITLES.map(t => (
                      <SelectItem key={t} value={t} className="font-mono text-xs">
                        {t === NONE ? '— none —' : t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="trainer-region" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                  // home region
                </Label>
                <Select value={region || NONE} onValueChange={(v) => setRegion(v === NONE ? '' : v)}>
                  <SelectTrigger className="font-mono text-xs">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE} className="font-mono text-xs">— none —</SelectItem>
                    {GENERATIONS.map(g => (
                      <SelectItem key={g.num} value={g.label} className="font-mono text-xs">{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* Favorite type */}
          <section>
            <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">
              // favorite type
            </Label>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setFavoriteType('')}
                className={cn(
                  'font-mono text-[10px] px-2 py-1 rounded border',
                  !favoriteType ? 'border-primary text-primary' : 'border-border text-muted-foreground'
                )}
              >none</button>
              {TYPES.map(t => (
                <button key={t} onClick={() => setFavoriteType(t)}
                        className={cn('transition rounded', favoriteType === t ? 'ring-1 ring-primary' : 'opacity-70 hover:opacity-100')}>
                  <TypePill type={t} />
                </button>
              ))}
            </div>
          </section>

          <Separator />

          {/* Signature Pokémon */}
          <section>
            <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 block">
              // signature pokémon
            </Label>
            {signatureId && POKEMON_BY_ID[signatureId] ? (
              <div className="flex items-center gap-2 p-2 rounded border mb-2" style={{ borderColor: 'hsl(var(--primary)/0.4)' }}>
                <img src={pixelSprite(signatureId)} alt="" className="pixel-img w-10 h-10 object-contain" />
                <div className="flex-1">
                  <div className="text-sm font-mono">{POKEMON_BY_ID[signatureId].display}</div>
                  <div className="flex gap-1 mt-0.5">
                    {POKEMON_BY_ID[signatureId].types.map(t => <TypePill key={t} type={t} sm />)}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSignatureId(undefined)}
                        className="text-[10px] font-mono text-muted-foreground hover:text-destructive">
                  remove
                </Button>
              </div>
            ) : null}
            <Input
              value={sigSearch}
              onChange={(e) => setSigSearch(e.target.value)}
              placeholder="search by name or #..."
              className="font-mono text-xs"
            />
            {filteredPokemon.length > 0 && (
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-1 max-h-40 overflow-y-auto scroll-y border rounded p-1.5">
                {filteredPokemon.map(p => (
                  <button key={p.id} onClick={() => { setSignatureId(p.id); setSigSearch(''); }}
                          className="aspect-square rounded border hover:border-primary p-1 text-center transition"
                          style={{ background: TYPE_COLORS[p.types[0]] + '11', borderColor: 'hsl(var(--border))' }}
                          title={p.display}>
                    <img src={pixelSprite(p.id)} alt="" className="pixel-img w-full h-full object-contain" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Motto */}
          <section>
            <Label htmlFor="motto" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
              // motto · catchphrase
            </Label>
            <Textarea
              id="motto" value={motto} onChange={(e) => setMotto(e.target.value)}
              placeholder='"Gotta catch em all!"'
              maxLength={80} rows={2}
              className="font-mono text-xs resize-none"
            />
            <div className="text-[10px] font-mono text-muted-foreground text-right mt-1">{motto.length}/80</div>
          </section>
        </div>

        <div className="p-4 border-t sticky bottom-0 bg-card flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1 font-mono text-xs">cancel</Button>
          <Button onClick={handleSave} className="flex-1 font-mono text-xs">
            <User size={12} className="mr-1.5" /> save profile
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
