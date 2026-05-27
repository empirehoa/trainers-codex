import { useState, useMemo, useEffect } from 'react';
import { Sparkles, Wand2, Zap, Layers } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import type { Pokemon, TeamMember, Move, SpriteKind, PokemonType } from '@/lib/types';
import { TYPE_COLORS, SPRITE_VARIANT_LABELS, TYPES } from '@/lib/constants';
import { spriteUrl, getLearnset, MOVES_BY_ID, suggestDefaultMoves } from '@/lib/pokemon';
import { TypePill } from './TypePill';
import { cn } from '@/lib/utils';

interface TeamMemberConfigDialogProps {
  open: boolean;
  onClose: () => void;
  pokemon: Pokemon | null;
  member: TeamMember | null;
  onSave: (next: TeamMember) => void;
  onOpenTCG: (p: Pokemon) => void;
  premium: boolean;
}

const SPRITE_VARIANTS: SpriteKind[] = [
  'pixel-default',
  'pixel-shiny',
  'artwork-default',
  'artwork-shiny',
  'home-default',
  'home-shiny',
];

export function TeamMemberConfigDialog({
  open, onClose, pokemon, member, onSave, onOpenTCG, premium
}: TeamMemberConfigDialogProps) {
  const [shiny, setShiny] = useState(false);
  const [nickname, setNickname] = useState('');
  const [ability, setAbility] = useState('');
  const [moves, setMoves] = useState<number[]>([]);
  const [sprite, setSprite] = useState<SpriteKind>('pixel-default');
  const [teraType, setTeraType] = useState<PokemonType | ''>('');
  const [moveSearch, setMoveSearch] = useState('');
  const [moveFilter, setMoveFilter] = useState<'all' | 'damaging' | 'status' | 'stab'>('all');

  useEffect(() => {
    if (!open || !pokemon) return;
    setShiny(member?.shiny ?? false);
    setNickname(member?.nickname ?? '');
    setAbility(member?.ability ?? pokemon.abilities[0] ?? '');
    setMoves(member?.moves?.slice(0, 4) ?? suggestDefaultMoves(pokemon.id));
    setSprite(member?.sprite ?? (member?.shiny ? 'pixel-shiny' : 'pixel-default'));
    setTeraType(member?.teraType ?? '');
    setMoveSearch('');
    setMoveFilter('all');
  }, [open, pokemon, member]);

  const learnset = useMemo<Move[]>(
    () => pokemon ? getLearnset(pokemon.id) : [],
    [pokemon]
  );

  const filteredMoves = useMemo(() => {
    if (!pokemon) return [];
    const q = moveSearch.trim().toLowerCase();
    return learnset.filter(m => {
      if (q && !m.display.toLowerCase().includes(q) && !m.type.includes(q)) return false;
      if (moveFilter === 'damaging' && m.category === 'status') return false;
      if (moveFilter === 'status' && m.category !== 'status') return false;
      if (moveFilter === 'stab' && !pokemon.types.includes(m.type)) return false;
      return true;
    }).slice(0, 200);
  }, [learnset, moveSearch, moveFilter, pokemon]);

  if (!pokemon) return null;
  const primary = TYPE_COLORS[pokemon.types[0]];

  const toggleMove = (id: number) => {
    setMoves(prev => {
      if (prev.includes(id)) return prev.filter(m => m !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const handleSave = () => {
    onSave({
      id: pokemon.id,
      shiny,
      nickname: nickname.trim() || undefined,
      ability: ability || undefined,
      moves: moves.length ? moves : undefined,
      sprite,
      teraType: teraType || undefined,
    });
    onClose();
  };

  const autoFillMoves = () => {
    setMoves(suggestDefaultMoves(pokemon.id));
  };

  const previewSprite = sprite.includes('home')
    ? spriteUrl(pokemon.id, sprite)
    : spriteUrl(pokemon.id, shiny ? (sprite.includes('artwork') ? 'artwork-shiny' : 'pixel-shiny') : sprite);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 max-h-[92vh] overflow-y-auto scroll-y bg-card">
        <DialogHeader className="px-4 py-3 border-b sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded relative flex items-center justify-center"
              style={{ background: `radial-gradient(circle, ${primary}33, transparent)` }}
            >
              <img
                src={previewSprite}
                alt=""
                className={sprite.includes('home') || sprite.includes('artwork') ? 'w-full h-full object-contain' : 'pixel-img w-full h-full object-contain'}
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  img.src = spriteUrl(pokemon.id, 'pixel-default');
                  img.classList.add('pixel-img');
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-display text-base lowercase" style={{ color: primary }}>
                customize {pokemon.display.toLowerCase()}
              </DialogTitle>
              <DialogDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                // {pokemon.types.join(' / ')} · bst {pokemon.bst} · {learnset.length} moves available
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="loadout" className="w-full">
          <TabsList className="grid grid-cols-3 mx-4 mt-4 bg-muted">
            <TabsTrigger value="loadout" className="font-mono text-[10px] uppercase">moves & ability</TabsTrigger>
            <TabsTrigger value="cosmetic" className="font-mono text-[10px] uppercase">cosmetic</TabsTrigger>
            <TabsTrigger value="nick" className="font-mono text-[10px] uppercase">identity</TabsTrigger>
          </TabsList>

          {/* ========== LOADOUT TAB ========== */}
          <TabsContent value="loadout" className="p-4 space-y-4 m-0">
            <div>
              <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 block">
                // ability
              </Label>
              <Select value={ability} onValueChange={setAbility}>
                <SelectTrigger className="font-mono text-xs">
                  <SelectValue placeholder="Pick ability" />
                </SelectTrigger>
                <SelectContent>
                  {pokemon.abilities.map(a => (
                    <SelectItem key={a} value={a} className="font-mono text-xs">{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  // moveset · {moves.length}/4 picked
                </Label>
                <Button variant="ghost" size="sm" onClick={autoFillMoves} className="h-6 text-[10px] font-mono">
                  <Wand2 size={10} className="mr-1" /> auto-fill
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-3">
                {[0, 1, 2, 3].map(i => {
                  const mid = moves[i];
                  const m = mid ? MOVES_BY_ID[mid] : null;
                  return (
                    <div
                      key={i}
                      className="rounded border p-1.5 text-center min-h-[52px] flex flex-col justify-center"
                      style={{
                        borderColor: m ? TYPE_COLORS[m.type] + '99' : 'hsl(var(--border))',
                        background: m ? TYPE_COLORS[m.type] + '11' : 'transparent',
                      }}
                    >
                      {m ? (
                        <>
                          <div className="text-[10px] font-mono truncate" style={{ color: TYPE_COLORS[m.type] }}>{m.display}</div>
                          <div className="text-[8px] font-mono opacity-70 mt-0.5">
                            {m.power > 0 ? `${m.power}pwr` : 'status'} · {m.accuracy ? `${m.accuracy}%` : '—'}
                          </div>
                          <button
                            onClick={() => toggleMove(m.id)}
                            className="text-[8px] font-mono opacity-50 hover:opacity-100 mt-0.5"
                          >
                            remove
                          </button>
                        </>
                      ) : (
                        <div className="text-[10px] font-mono text-muted-foreground">slot {i + 1}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 mb-2">
                <Input
                  value={moveSearch}
                  onChange={(e) => setMoveSearch(e.target.value)}
                  placeholder="search moves..."
                  className="font-mono text-xs h-8"
                />
                <Select value={moveFilter} onValueChange={(v) => setMoveFilter(v as typeof moveFilter)}>
                  <SelectTrigger className="w-32 h-8 text-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs font-mono">all</SelectItem>
                    <SelectItem value="damaging" className="text-xs font-mono">damaging</SelectItem>
                    <SelectItem value="status" className="text-xs font-mono">status</SelectItem>
                    <SelectItem value="stab" className="text-xs font-mono">STAB only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="max-h-72 overflow-y-auto scroll-y border rounded p-1.5 bg-background/50">
                {filteredMoves.length === 0 ? (
                  <div className="text-center py-6 font-mono text-xs text-muted-foreground">no moves match</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {filteredMoves.map(m => {
                      const picked = moves.includes(m.id);
                      const isStab = pokemon.types.includes(m.type);
                      const disabled = !picked && moves.length >= 4;
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleMove(m.id)}
                          disabled={disabled}
                          className={cn(
                            'flex items-center gap-2 p-1.5 rounded border text-left transition disabled:opacity-40 disabled:cursor-not-allowed',
                            picked ? 'border-primary' : 'border-transparent hover:border-border'
                          )}
                          style={{
                            background: picked ? TYPE_COLORS[m.type] + '22' : 'transparent',
                          }}
                        >
                          <TypePill type={m.type} sm />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-mono truncate flex items-center gap-1">
                              {m.display}
                              {isStab && <Zap size={8} className="text-primary shrink-0" />}
                            </div>
                            <div className="text-[9px] font-mono opacity-60">
                              {m.category} · {m.power > 0 ? `${m.power}pwr` : 'status'}
                              {m.accuracy ? ` · ${m.accuracy}%` : ''}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-[10px] font-mono mt-1 text-muted-foreground">
                <Zap size={8} className="inline text-primary" /> = STAB (same-type attack bonus)
              </p>
            </div>
          </TabsContent>

          {/* ========== COSMETIC TAB ========== */}
          <TabsContent value="cosmetic" className="p-4 space-y-4 m-0">
            <div className="flex items-center justify-between p-3 border rounded-md"
                 style={{ borderColor: shiny ? '#fde047aa' : 'hsl(var(--border))', background: shiny ? 'rgba(253,224,71,0.05)' : 'transparent' }}>
              <div className="flex items-center gap-2">
                <Sparkles size={16} className={shiny ? 'text-yellow-300' : 'text-muted-foreground'} />
                <div>
                  <Label htmlFor="shiny-switch" className="font-mono text-sm cursor-pointer">Shiny variant</Label>
                  <p className="font-mono text-[10px] text-muted-foreground">Alternate-colored sprite · 1/4096 in-game</p>
                </div>
              </div>
              <Switch id="shiny-switch" checked={shiny} onCheckedChange={(c) => {
                setShiny(c);
                // Auto-adjust sprite to match
                if (c && !sprite.includes('shiny')) {
                  const base = sprite.replace('-default', '-shiny') as SpriteKind;
                  setSprite(base);
                } else if (!c && sprite.includes('shiny')) {
                  const base = sprite.replace('-shiny', '-default') as SpriteKind;
                  setSprite(base);
                }
              }} />
            </div>

            <div>
              <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 block">
                // sprite style
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SPRITE_VARIANTS.map(v => {
                  const isPicked = sprite === v;
                  const isPremium = v.startsWith('home') && !premium;
                  return (
                    <button
                      key={v}
                      onClick={() => !isPremium && setSprite(v)}
                      disabled={isPremium}
                      className={cn(
                        'rounded-md border p-2 transition disabled:opacity-40 disabled:cursor-not-allowed text-left',
                        isPicked ? 'border-primary' : 'border-border hover:border-primary/50'
                      )}
                      style={{ background: isPicked ? primary + '11' : 'transparent' }}
                    >
                      <div className="aspect-square mb-1 rounded flex items-center justify-center"
                           style={{ background: 'hsl(var(--background))' }}>
                        <img
                          src={spriteUrl(pokemon.id, v)}
                          alt=""
                          loading="lazy"
                          className={(v.includes('artwork') || v.includes('home')) ? 'w-full h-full object-contain p-1' : 'pixel-img w-full h-full object-contain p-1'}
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.2'; }}
                        />
                      </div>
                      <div className="text-[9px] font-mono truncate flex items-center gap-1">
                        {SPRITE_VARIANT_LABELS[v]}
                        {isPremium && <span className="text-primary">·premium</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!premium && (
                <p className="text-[10px] font-mono text-muted-foreground mt-2">
                  3D HOME sprites are part of the premium pack. Pixel + artwork are free.
                </p>
              )}
            </div>
          </TabsContent>

          {/* ========== IDENTITY TAB ========== */}
          <TabsContent value="nick" className="p-4 space-y-4 m-0">
            <div>
              <Label htmlFor="nickname" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 block">
                // nickname
              </Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={pokemon.display}
                maxLength={12}
                className="font-mono"
              />
              <p className="text-[10px] font-mono text-muted-foreground mt-1">Max 12 characters · leave blank for default name</p>
            </div>

            <Separator />

            {/* Tera Type — Gen 9 mechanic */}
            <div>
              <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 block">
                // tera type · gen 9 terastallization
              </Label>
              <p className="text-[10px] font-mono text-muted-foreground mb-2">
                In Scarlet/Violet & Legends Z-A, Pokémon can Terastallize once per battle to change their type. Pick the type your strategy assumes.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setTeraType('')}
                  className={cn(
                    'font-mono text-[10px] px-2 py-1 rounded border transition uppercase tracking-wider',
                    teraType === '' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:border-primary'
                  )}>
                  none
                </button>
                {TYPES.map(t => {
                  const active = teraType === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTeraType(t)}
                      className={cn(
                        'font-mono text-[10px] px-2 py-1 rounded border transition uppercase tracking-wider',
                        active ? 'text-white' : 'text-muted-foreground hover:opacity-100'
                      )}
                      style={{
                        background: active ? TYPE_COLORS[t] : 'transparent',
                        borderColor: active ? TYPE_COLORS[t] : 'hsl(var(--border))',
                        opacity: active ? 1 : 0.7,
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              {teraType && pokemon.types.includes(teraType) && (
                <p className="text-[10px] font-mono text-amber-400 mt-2">
                  ⓘ Same-type Tera ({teraType}) — boosts STAB from 1.5× to 2× but doesn't change defensive type matchups.
                </p>
              )}
              {teraType && !pokemon.types.includes(teraType) && (
                <p className="text-[10px] font-mono text-emerald-400 mt-2">
                  ⓘ Off-type Tera — changes defensive type to pure {teraType} when Terastallized; gains 1.5× STAB on {teraType} moves.
                </p>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-1 text-muted-foreground">// stats summary</div>
                <div>HP {pokemon.stats.hp} · ATK {pokemon.stats.atk}</div>
                <div>DEF {pokemon.stats.def} · SPA {pokemon.stats.spa}</div>
                <div>SPD {pokemon.stats.spd} · SPE {pokemon.stats.spe}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest mb-1 text-muted-foreground">// roles</div>
                {pokemon.roles.length > 0
                  ? pokemon.roles.map(r => <div key={r}>· {r}</div>)
                  : <div className="text-muted-foreground">balanced</div>}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="p-4 border-t sticky bottom-0 bg-card flex gap-2">
          <Button variant="outline" onClick={() => pokemon && onOpenTCG(pokemon)} className="font-mono text-xs">
            <Layers size={12} className="mr-1" /> tcg
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1 font-mono text-xs">cancel</Button>
          <Button onClick={handleSave} className="flex-1 font-mono text-xs">save changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
