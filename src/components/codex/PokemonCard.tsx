import { Plus, Check, Star, Sparkles } from 'lucide-react';
import type { Pokemon } from '@/lib/types';
import { TYPE_COLORS } from '@/lib/constants';
import { pixelSprite, padId } from '@/lib/pokemon';
import { TypePill } from './TypePill';
import { cn } from '@/lib/utils';

interface PokemonCardProps {
  p: Pokemon;
  onSelect: () => void;
  onAdd: () => void;
  inTeam: boolean;
  teamFull: boolean;
  // When set, the mon is banned by the active format. It stays visible (so the
  // user can still inspect it) but is dimmed, badged, and not addable.
  illegal?: boolean;
  illegalReason?: string;
}

// Form badge: short label + accent color for the corner ribbon
const FORM_BADGES: Record<string, { label: string; color: string }> = {
  mega:        { label: 'MEGA',   color: '#f97316' },
  primal:      { label: 'PRIMAL', color: '#dc2626' },
  alolan:      { label: 'ALOLA',  color: '#fb923c' },
  galarian:    { label: 'GALAR',  color: '#a855f7' },
  hisuian:     { label: 'HISUI',  color: '#84cc16' },
  paldean:     { label: 'PALDEA', color: '#06b6d4' },
  gigantamax:  { label: 'G-MAX',  color: '#ef4444' },
  therian:     { label: 'THERIAN', color: '#3b82f6' },
  origin:      { label: 'ORIGIN', color: '#8b5cf6' },
  fusion:      { label: 'FUSION', color: '#ec4899' },
  crowned:     { label: 'CROWNED', color: '#eab308' },
  eternamax:   { label: 'E-MAX',  color: '#7c3aed' },
  mode:        { label: 'FORM',   color: '#64748b' },
  style:       { label: 'STYLE',  color: '#64748b' },
  form:        { label: 'FORM',   color: '#64748b' },
};

export function PokemonCard({ p, onSelect, onAdd, inTeam, teamFull, illegal, illegalReason }: PokemonCardProps) {
  const primary = TYPE_COLORS[p.types[0]];
  const disabled = inTeam || teamFull || !!illegal;
  const badge = p.form ? FORM_BADGES[p.form] : null;

  return (
    <div
      data-illegal={illegal ? 'true' : undefined}
      title={illegal ? `banned · ${illegalReason || 'illegal in this format'}` : undefined}
      className={cn(
        'group relative rounded-md border overflow-hidden transition fade-up',
        'hover:border-primary/60',
        illegal && 'opacity-45 grayscale'
      )}
      style={{
        borderColor: inTeam ? primary : illegal ? 'hsl(var(--destructive))' : 'hsl(var(--border))',
        background: `linear-gradient(180deg, ${primary}11 0%, hsl(var(--card)) 80%)`,
      }}
    >
      <button onClick={onSelect} className="w-full text-left p-2.5">
        <div className="flex items-start justify-between mb-1 gap-1">
          <span className="font-mono text-[9px] text-muted-foreground">{padId(p.id)}</span>
          <div className="flex items-center gap-1">
            {p.legendary && (
              <Star size={9} className="shrink-0" style={{ color: '#fde047', fill: '#fde04766' }} />
            )}
            {p.mythical && (
              <Sparkles size={9} className="shrink-0" style={{ color: '#a78bfa', filter: 'drop-shadow(0 0 1px rgba(167,139,250,0.5))' }} />
            )}
            <span className="font-mono text-[10px] font-bold" style={{ color: primary }}>{p.bst}</span>
          </div>
        </div>
        <div
          className="aspect-square w-full flex items-center justify-center relative"
          style={{ background: `radial-gradient(circle at center, ${primary}22, transparent 70%)` }}
        >
          <img
            src={pixelSprite(p.id)}
            alt={p.display}
            loading="lazy"
            className="pixel-img w-full h-full object-contain p-1 group-hover:scale-110 transition-transform"
          />
          {badge && (
            <span
              className="absolute top-0 left-0 px-1 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider rounded-br"
              style={{ background: badge.color, color: '#fff' }}
            >
              {badge.label}
            </span>
          )}
          {illegal && (
            <span
              className="absolute top-0 right-0 px-1 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider rounded-bl"
              style={{ background: 'hsl(var(--destructive))', color: '#fff' }}
            >
              BANNED
            </span>
          )}
        </div>
        <div className="mt-1.5 text-center">
          <div className="text-xs truncate" style={{ color: 'hsl(var(--foreground))' }}>{p.display}</div>
          <div className="flex gap-1 justify-center mt-1 flex-wrap">
            {p.types.map(t => <TypePill key={t} type={t} sm />)}
          </div>
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); if (!disabled) onAdd(); }}
        disabled={disabled}
        aria-label={inTeam ? 'In team' : 'Add to team'}
        className={cn(
          'absolute bottom-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center transition',
          'disabled:cursor-not-allowed'
        )}
        style={{
          background: inTeam ? primary + '88' : disabled ? 'hsl(var(--muted))' : 'hsl(var(--primary))',
          color: 'hsl(var(--primary-foreground))',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {inTeam ? <Check size={11} /> : <Plus size={11} />}
      </button>
    </div>
  );
}
