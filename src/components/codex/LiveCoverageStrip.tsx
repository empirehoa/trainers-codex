import { useMemo } from 'react';
import { Shield, Sword, AlertTriangle } from 'lucide-react';
import type { Pokemon, PokemonType } from '@/lib/types';
import { TYPES, TYPE_CHART } from '@/lib/constants';
import { TypePill } from './TypePill';

interface LiveCoverageStripProps {
  team: (Pokemon | null)[];
}

/**
 * Lightweight live-coverage indicator that sits in the team bar.
 * Shows:
 *  - the team's biggest defensive weaknesses (types where 2+ members are weak with no resists)
 *  - offensive coverage gaps (types nothing on the team can hit super-effectively)
 *
 * Designed for at-a-glance use while building, not deep analysis.
 */
export function LiveCoverageStrip({ team }: LiveCoverageStripProps) {
  const filled = team.filter(Boolean) as Pokemon[];

  const { weakTypes, coverageGaps, score } = useMemo(() => {
    if (filled.length === 0) {
      return { weakTypes: [] as { type: PokemonType; weak: number; resist: number }[], coverageGaps: [] as PokemonType[], score: 0 };
    }
    // For each attacking type, count team members that are weak vs resist
    const perType = TYPES.map(t => {
      let weak = 0, resist = 0;
      for (const p of filled) {
        let mult = 1;
        for (const def of p.types) {
          mult *= TYPE_CHART[t]?.[def] ?? 1;
        }
        if (mult > 1) weak++;
        else if (mult < 1) resist++;
      }
      return { type: t, weak, resist };
    });

    // Weakness rule: 2+ weak, ≤1 resist
    const weakTypes = perType
      .filter(r => r.weak >= 2 && r.resist <= 1)
      .sort((a, b) => (b.weak - b.resist) - (a.weak - a.resist))
      .slice(0, 6);

    // Offensive coverage: a type is "uncovered" if no team member has any move type
    // that hits it super-effectively (using STAB types as a proxy for "what they can throw").
    const coveredBy: Record<PokemonType, number> = Object.fromEntries(TYPES.map(t => [t, 0])) as Record<PokemonType, number>;
    for (const p of filled) {
      for (const attackingType of p.types) {
        for (const defendingType of TYPES) {
          if ((TYPE_CHART[attackingType]?.[defendingType] ?? 1) > 1) {
            coveredBy[defendingType]++;
          }
        }
      }
    }
    const coverageGaps = TYPES.filter(t => coveredBy[t] === 0).slice(0, 8);

    // Composite score: 100 = no weaknesses, no gaps
    const weakPenalty = Math.min(weakTypes.length * 12, 60);
    const gapPenalty = Math.min(coverageGaps.length * 6, 40);
    const score = Math.max(0, 100 - weakPenalty - gapPenalty);

    return { weakTypes, coverageGaps, score };
  }, [filled]);

  if (filled.length === 0) return null;

  const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';
  const scoreLabel = score >= 80 ? 'solid' : score >= 60 ? 'okay' : score >= 40 ? 'patchy' : 'fragile';

  return (
    <div className="border-t backdrop-blur-md bg-background/95" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="max-w-6xl mx-auto px-3 py-2 flex items-center gap-3 text-[10px] font-mono overflow-x-auto scroll-x">
        {/* Coverage score */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-muted-foreground uppercase tracking-wider">coverage</span>
          <span
            className="px-1.5 py-0.5 rounded font-semibold"
            style={{
              background: scoreColor + '22',
              color: scoreColor,
              border: `1px solid ${scoreColor}66`,
            }}
            title={`Composite score based on defensive weaknesses and offensive gaps. ${scoreLabel.toUpperCase()}.`}
          >
            {score}/100 · {scoreLabel}
          </span>
        </div>

        {/* Weak-to */}
        {weakTypes.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Shield size={10} className="text-red-400 shrink-0" />
            <span className="text-muted-foreground uppercase tracking-wider mr-0.5">weak to</span>
            <div className="flex gap-1">
              {weakTypes.map(w => (
                <div key={w.type} className="relative" title={`${w.weak} weak / ${w.resist} resist`}>
                  <TypePill type={w.type} sm />
                  {w.weak >= 3 && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center pointer-events-none">
                      !
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coverage gaps */}
        {coverageGaps.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Sword size={10} className="text-amber-400 shrink-0" />
            <span className="text-muted-foreground uppercase tracking-wider mr-0.5">no hit on</span>
            <div className="flex gap-1">
              {coverageGaps.map(t => (
                <TypePill key={t} type={t} sm />
              ))}
            </div>
          </div>
        )}

        {/* All clear */}
        {weakTypes.length === 0 && coverageGaps.length === 0 && (
          <div className="flex items-center gap-1.5 text-emerald-400 shrink-0">
            <Shield size={10} />
            <span className="uppercase tracking-wider">no major holes · ship it</span>
          </div>
        )}

        {/* Spacer for centering on wide screens */}
        <div className="flex-1" />

        {/* Threats counter on the right */}
        {weakTypes.some(w => w.weak >= 3) && (
          <div className="flex items-center gap-1 text-red-400 shrink-0">
            <AlertTriangle size={10} />
            <span className="font-semibold">{weakTypes.filter(w => w.weak >= 3).length} critical</span>
          </div>
        )}
      </div>
    </div>
  );
}