import { X, Sparkles, Settings2, Gem } from 'lucide-react';
import type { Pokemon, TeamMember } from '@/lib/types';
import { TYPE_COLORS } from '@/lib/constants';
import { pixelSprite } from '@/lib/pokemon';

interface TeamSlotProps {
  p: Pokemon | null;
  member: TeamMember | null;
  idx: number;
  onRemove: () => void;
  onOpen: () => void;
  onConfigure: () => void;
}

export function TeamSlot({ p, member, onRemove, onOpen, onConfigure }: TeamSlotProps) {
  if (!p) {
    return (
      <button
        onClick={onOpen}
        className="shrink-0 w-12 h-12 rounded-md border border-dashed flex items-center justify-center font-mono text-[10px]"
        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
      >
        +
      </button>
    );
  }
  const primary = TYPE_COLORS[p.types[0]];
  const shiny = member?.shiny;
  const tera = member?.teraType;
  const teraColor = tera ? TYPE_COLORS[tera] : null;
  return (
    <div
      className="shrink-0 w-12 h-12 rounded-md border relative group"
      style={{
        borderColor: shiny ? '#fde047' : primary + 'aa',
        background: `radial-gradient(circle, ${primary}22, transparent)`,
        boxShadow: shiny ? '0 0 8px rgba(253,224,71,0.4)' : undefined,
      }}
    >
      <button onClick={onConfigure} className="w-full h-full" title={`Configure ${p.display}${tera ? ` · Tera ${tera}` : ''}`}>
        <img
          src={pixelSprite(p.id, shiny)}
          alt={p.display}
          className="pixel-img w-full h-full object-contain p-0.5"
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            // Fall back to non-shiny if shiny missing
            if (shiny) img.src = pixelSprite(p.id, false);
          }}
        />
      </button>
      {shiny && (
        <Sparkles
          size={9}
          className="absolute top-0 left-0.5 pointer-events-none"
          style={{ color: '#fde047', filter: 'drop-shadow(0 0 2px rgba(253,224,71,0.8))' }}
        />
      )}
      {tera && teraColor && (
        <span
          className="absolute top-0 right-0 w-3 h-3 rounded-full pointer-events-none flex items-center justify-center"
          style={{
            background: teraColor,
            boxShadow: `0 0 4px ${teraColor}, inset 0 0 1px rgba(255,255,255,0.5)`,
            border: '1px solid rgba(255,255,255,0.6)',
          }}
          title={`Tera ${tera}`}
        >
          <Gem size={6} className="text-white" />
        </span>
      )}
      <button
        onClick={onConfigure}
        aria-label={`Configure ${p.display}`}
        className="absolute bottom-0 left-0 w-3.5 h-3.5 rounded-tr-md rounded-bl-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
        style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
      >
        <Settings2 size={8} />
      </button>
      <button
        onClick={onRemove}
        aria-label={`Remove ${p.display}`}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
        style={{ background: 'hsl(var(--destructive))', color: 'white' }}
      >
        <X size={9} />
      </button>
    </div>
  );
}
