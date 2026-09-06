import { TYPE_COLORS } from '@/lib/constants';
import type { PokemonType } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TypePillProps {
  type: PokemonType;
  sm?: boolean;
}

export function TypePill({ type, sm }: TypePillProps) {
  const color = TYPE_COLORS[type];
  return (
    <span
      className={cn(
        'inline-block rounded font-mono uppercase tracking-wider align-middle',
        sm ? 'text-[10px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5'
      )}
      style={{ background: color + '33', color, border: `1px solid ${color}66` }}
    >
      {type}
    </span>
  );
}
