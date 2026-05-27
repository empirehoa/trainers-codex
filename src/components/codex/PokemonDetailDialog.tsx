import { useState } from 'react';
import { Plus, Check, ImageIcon, Star, Sparkles, Layers } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { Pokemon } from '@/lib/types';
import { TYPE_COLORS, STAT_KEYS, STAT_LABELS } from '@/lib/constants';
import { pixelSprite, artworkSprite, padId, getGen } from '@/lib/pokemon';
import { TypePill } from './TypePill';

interface PokemonDetailDialogProps {
  pokemon: Pokemon | null;
  open: boolean;
  onClose: () => void;
  onAdd: () => void;
  onViewTCG: () => void;
  inTeam: boolean;
  teamFull: boolean;
}

export function PokemonDetailDialog({ pokemon, open, onClose, onAdd, onViewTCG, inTeam, teamFull }: PokemonDetailDialogProps) {
  const [showArt, setShowArt] = useState(false);
  const [showShiny, setShowShiny] = useState(false);
  if (!pokemon) return null;
  const primary = TYPE_COLORS[pokemon.types[0]];
  const maxStat = Math.max(...STAT_KEYS.map(k => pokemon.stats[k]));
  const sprite = showArt
    ? artworkSprite(pokemon.id, showShiny)
    : pixelSprite(pokemon.id, showShiny);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 border bg-card">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="font-display text-lg" style={{ color: primary }}>
              {pokemon.display.toLowerCase()}
            </DialogTitle>
            <span className="font-mono text-[10px] text-muted-foreground">{padId(pokemon.id)}</span>
            {pokemon.legendary && (
              <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border"
                    style={{ borderColor: '#fde047', color: '#fde047', background: 'rgba(253,224,71,0.1)' }}>
                <Star size={8} className="inline mr-0.5" /> legendary
              </span>
            )}
            {pokemon.mythical && (
              <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border"
                    style={{ borderColor: '#a78bfa', color: '#a78bfa', background: 'rgba(167,139,250,0.1)' }}>
                <Sparkles size={8} className="inline mr-0.5" /> mythical
              </span>
            )}
          </div>
          <DialogDescription className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            // gen {getGen(pokemon.id)} · bst {pokemon.bst}
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* Sprite */}
          <div
            className="aspect-square w-full rounded-md border flex items-center justify-center relative overflow-hidden"
            style={{
              borderColor: showShiny ? '#fde047aa' : primary + 'aa',
              background: showShiny
                ? 'radial-gradient(circle at center, rgba(253,224,71,0.15), hsl(var(--card)) 80%)'
                : `radial-gradient(circle at center, ${primary}22, hsl(var(--card)) 80%)`,
            }}
          >
            <img
              src={sprite}
              alt={pokemon.display}
              className={showArt ? 'w-full h-full object-contain p-4' : 'pixel-img w-full h-full object-contain p-2'}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = pixelSprite(pokemon.id);
                e.currentTarget.classList.add('pixel-img');
              }}
            />
            <div className="absolute top-2 right-2 flex flex-col gap-1.5">
              <button
                onClick={() => setShowArt(v => !v)}
                className="w-8 h-8 rounded-md border flex items-center justify-center"
                style={{ background: 'hsl(var(--card)/0.9)', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                title={showArt ? 'Switch to pixel sprite' : 'Switch to official artwork'}
              >
                <ImageIcon size={13} />
              </button>
              <button
                onClick={() => setShowShiny(v => !v)}
                className="w-8 h-8 rounded-md border flex items-center justify-center"
                style={{
                  background: showShiny ? 'rgba(253,224,71,0.2)' : 'hsl(var(--card)/0.9)',
                  borderColor: showShiny ? '#fde047' : 'hsl(var(--border))',
                  color: showShiny ? '#fde047' : 'hsl(var(--foreground))',
                }}
                title={showShiny ? 'Switch to default colors' : 'Switch to shiny variant'}
              >
                <Sparkles size={13} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {pokemon.types.map(t => <TypePill key={t} type={t} />)}
            {pokemon.roles.map(r => (
              <span key={r} className="text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider"
                    style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                {r}
              </span>
            ))}
          </div>

          <Separator />

          {/* Stats */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest mb-2 text-muted-foreground">// base stats</div>
            <div className="space-y-1.5">
              {STAT_KEYS.map(k => {
                const v = pokemon.stats[k];
                const pct = (v / 255) * 100;
                const color = v >= 100 ? '#7fc04e' : v >= 70 ? '#f4ae3c' : '#8a7e62';
                return (
                  <div key={k} className="flex items-center gap-2">
                    <div className="w-9 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{STAT_LABELS[k]}</div>
                    <div className="w-10 text-right font-mono text-xs" style={{ color: v === maxStat ? primary : 'hsl(var(--foreground))' }}>{v}</div>
                    <div className="flex-1 h-1.5 rounded overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                      <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Abilities + measurements */}
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1 text-muted-foreground">// abilities</div>
              {pokemon.abilities.map(a => (
                <div key={a} className="text-foreground">{a}</div>
              ))}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1 text-muted-foreground">// dimensions</div>
              <div>{pokemon.height}m · {pokemon.weight}kg</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={onAdd}
              disabled={inTeam || teamFull}
              style={{
                background: inTeam ? 'transparent' : 'hsl(var(--primary))',
                color: inTeam ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary-foreground))',
                border: inTeam ? '1px solid hsl(var(--border))' : 'none',
              }}
              className="font-mono text-xs"
            >
              {inTeam ? <><Check size={13} className="mr-1.5" /> in team</> :
               teamFull ? 'team full' :
               <><Plus size={13} className="mr-1.5" /> add to team</>}
            </Button>
            <Button variant="outline" onClick={onViewTCG} className="font-mono text-xs">
              <Layers size={12} className="mr-1.5" /> tcg cards
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
