import { TYPE_COLORS } from '@/lib/constants';
import { TYPE_TEXT_COLORS } from '@/lib/contrast';
import type { PokemonType } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TypePillProps {
  type: PokemonType;
  sm?: boolean;
}

// TYPE_COLORS stay the fill; the text colour is a per-theme readable variant
// (lib/contrast.ts) applied by index.css `.type-pill` so the theme, not the
// component, decides which one shows.
export function TypePill({ type, sm }: TypePillProps) {
  const color = TYPE_COLORS[type];
  const text = TYPE_TEXT_COLORS[type];
  return (
    <span
      className={cn(
        'type-pill inline-block rounded font-mono uppercase tracking-wider align-middle',
        sm ? 'text-[10px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5'
      )}
      style={{
        background: color + '33',
        border: `1px solid ${color}66`,
        ['--pill-text-dark' as string]: text.dark,
        ['--pill-text-light' as string]: text.light,
      }}
    >
      {type}
    </span>
  );
}
