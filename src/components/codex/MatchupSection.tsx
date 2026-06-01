import { useMemo, useState } from 'react';
import { Swords, Gauge, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { TeamMember, Pokemon } from '@/lib/types';
import { computeMatchup } from '@/lib/matchup';
import { POKEMON_BY_ID, POKEMON_LIST, pixelSprite } from '@/lib/pokemon';
import { TYPE_COLORS } from '@/lib/constants';
import { TypePill } from './TypePill';

interface MatchupSectionProps {
  team: (TeamMember | null)[];
}

// Color a damage % the way the Showdown calc community reads it: red = lethal.
function pctColor(pct: number): string {
  if (pct >= 100) return '#dc2626';
  if (pct >= 50) return '#f4ae3c';
  if (pct >= 25) return '#7fc04e';
  return '#9ca3af';
}

export function MatchupSection({ team }: MatchupSectionProps) {
  const [opponentId, setOpponentId] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const members = team.filter((m): m is TeamMember => Boolean(m));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return POKEMON_LIST
      .filter(p => p.name.includes(q))
      .slice(0, 8)
      .map(p => POKEMON_BY_ID[p.id])
      .filter(Boolean);
  }, [query]);

  const opponent = opponentId != null ? POKEMON_BY_ID[opponentId] : null;

  return (
    <section className="border rounded-md p-3" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="flex items-baseline gap-2 mb-2">
        <Swords size={13} className="self-center text-primary" />
        <h3 className="font-display text-sm text-primary">matchup preview</h3>
        <div className="text-[10px] font-mono text-muted-foreground">// @smogon/calc damage ranges vs one opponent · lvl 50</div>
      </div>

      {/* Opponent picker */}
      {!opponent ? (
        <div className="relative">
          <div className="flex items-center gap-1.5 border rounded px-2" style={{ borderColor: 'hsl(var(--border))' }}>
            <Search size={12} className="text-muted-foreground shrink-0" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="// pick an opponent to calc against"
              className="bg-transparent border-none px-0 h-8 font-mono text-[11px] focus-visible:ring-0"
            />
          </div>
          {matches.length > 0 && (
            <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {matches.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setOpponentId(p.id); setQuery(''); }}
                  className="text-left rounded border transition p-1.5 hover:border-primary bg-card flex items-center gap-2"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <div className="w-8 h-8 shrink-0 rounded flex items-center justify-center"
                       style={{ background: `radial-gradient(circle, ${TYPE_COLORS[p.types[0]]}33, transparent)` }}>
                    <img src={pixelSprite(p.id)} alt="" className="pixel-img w-full h-full object-contain" loading="lazy" />
                  </div>
                  <span className="text-xs truncate">{p.display}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Selected opponent header */}
          <div className="flex items-center gap-2 mb-3 p-2 rounded border" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}>
            <div className="w-10 h-10 shrink-0 rounded flex items-center justify-center"
                 style={{ background: `radial-gradient(circle, ${TYPE_COLORS[opponent.types[0]]}33, transparent)` }}>
              <img src={pixelSprite(opponent.id)} alt="" className="pixel-img w-full h-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs">vs {opponent.display}</div>
              <div className="flex gap-1 mt-0.5">{opponent.types.map(t => <TypePill key={t} type={t} sm />)}</div>
            </div>
            <button
              onClick={() => setOpponentId(null)}
              title="Change opponent"
              className="shrink-0 rounded border w-7 h-7 flex items-center justify-center hover:border-destructive"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <X size={12} />
            </button>
          </div>

          {/* Per-member matchups */}
          <div className="space-y-2">
            {members.map((m, i) => {
              const p = POKEMON_BY_ID[m.id] as Pokemon | undefined;
              const mu = computeMatchup(m, opponent.id);
              return (
                <div key={i} className="rounded border p-2" style={{ borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-8 h-8 shrink-0 rounded flex items-center justify-center"
                         style={{ background: p ? `radial-gradient(circle, ${TYPE_COLORS[p.types[0]]}33, transparent)` : undefined }}>
                      <img src={pixelSprite(m.id, m.shiny)} alt="" className="pixel-img w-full h-full object-contain"
                           onError={(e) => { if (m.shiny) (e.currentTarget as HTMLImageElement).src = pixelSprite(m.id); }} />
                    </div>
                    <div className="text-xs truncate flex-1 min-w-0">{m.nickname || p?.display || `#${m.id}`}</div>
                    {mu.supported && (
                      <div className="flex items-center gap-1 shrink-0 font-mono text-[10px]"
                           style={{ color: mu.speedNote === 'outspeeds' ? '#7fc04e' : mu.speedNote === 'outsped by' ? '#f4ae3c' : '#9ca3af' }}>
                        <Gauge size={11} />
                        <span>{mu.speedNote} ({mu.attackerSpe} vs {mu.defenderSpe})</span>
                      </div>
                    )}
                  </div>

                  {!mu.supported ? (
                    <div className="text-[10px] font-mono text-muted-foreground ml-10">// not modeled by @smogon/calc (new form)</div>
                  ) : mu.moves.length === 0 ? (
                    <div className="text-[10px] font-mono text-muted-foreground ml-10">// no damaging moves set</div>
                  ) : (
                    <ul className="ml-10 space-y-1">
                      {mu.moves.map((mv, j) => {
                        const color = pctColor(mv.maxPct);
                        return (
                          <li key={j} className="font-mono text-[10px] flex items-center gap-2">
                            <span className="w-24 truncate shrink-0">{mv.move}</span>
                            <span className="w-20 shrink-0" style={{ color }}>{mv.minPct}–{mv.maxPct}%</span>
                            {mv.koText && <span className="text-muted-foreground truncate">{mv.koText}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
