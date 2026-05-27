import { CheckCircle2, AlertTriangle, XCircle, Gamepad2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { TeamMember, Pokemon } from '@/lib/types';
import { analyzeTeamCompatibility, recommendTargetGame } from '@/lib/compatibility';
import { POKEMON_BY_ID, pixelSprite } from '@/lib/pokemon';
import { useState } from 'react';

interface GameCompatibilitySectionProps {
  team: (TeamMember | null)[];
}

export function GameCompatibilitySection({ team }: GameCompatibilitySectionProps) {
  const [showAll, setShowAll] = useState(false);
  const pokes: Pokemon[] = team
    .map(m => (m ? POKEMON_BY_ID[m.id] : null))
    .filter((x): x is Pokemon => Boolean(x));

  if (pokes.length === 0) return null;

  const results = analyzeTeamCompatibility(team);
  const { result: recommended, instructions } = recommendTargetGame(results);
  const sortedResults = [...results].sort((a, b) => b.game.releaseYear - a.game.releaseYear);

  return (
    <section
      className="border rounded-md p-3"
      style={{
        borderColor: recommended.playable ? 'hsl(120, 50%, 35%)' : 'hsl(var(--border))',
        background: recommended.playable
          ? 'linear-gradient(180deg, hsl(120, 50%, 35%, 0.08), transparent)'
          : 'transparent',
      }}
    >
      <div className="flex items-baseline gap-2 mb-2">
        <Gamepad2 size={13} className="self-center text-primary" />
        <h3 className="font-display text-sm text-primary">game compatibility</h3>
        <div className="text-[10px] font-mono text-muted-foreground">// can you actually play this team?</div>
      </div>

      {/* Headline recommendation */}
      <div className="mb-3 p-2.5 rounded border" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}>
        <div className="flex items-center gap-2 mb-1.5">
          {recommended.playable ? (
            <CheckCircle2 size={14} className="text-emerald-400" />
          ) : (
            <AlertTriangle size={14} className="text-yellow-400" />
          )}
          <div className="font-mono text-xs font-semibold">
            {recommended.playable
              ? `Fully playable in ${recommended.game.label}`
              : `Best fit: ${recommended.game.label} (${recommended.available.length}/${pokes.length})`}
          </div>
        </div>
        <ul className="text-[10px] font-mono space-y-0.5 ml-5 text-muted-foreground list-disc">
          {instructions.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </div>

      {/* All games matrix */}
      <Button
        variant="ghost" size="sm"
        onClick={() => setShowAll(v => !v)}
        className="w-full justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary"
      >
        <span>{showAll ? 'hide' : 'show'} all 6 games</span>
        <ChevronRight size={11} className={showAll ? 'rotate-90 transition' : 'transition'} />
      </Button>

      {showAll && (
        <div className="mt-2 space-y-1.5 fade-up">
          {sortedResults.map(r => {
            const pct = pokes.length > 0 ? (r.available.length / pokes.length) * 100 : 0;
            const color = r.playable ? '#22c55e' : r.available.length > 0 ? '#eab308' : '#9ca3af';
            return (
              <div key={r.game.id} className="rounded border p-2" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="font-mono text-xs">{r.game.shortLabel}</div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="font-mono text-[9px]">{r.game.console}</Badge>
                    {r.playable
                      ? <CheckCircle2 size={11} className="text-emerald-400" />
                      : r.available.length > 0
                        ? <AlertTriangle size={11} className="text-yellow-400" />
                        : <XCircle size={11} className="text-red-400" />}
                  </div>
                </div>
                <div className="h-1 rounded overflow-hidden mb-1" style={{ background: 'hsl(var(--muted))' }}>
                  <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
                </div>
                <div className="text-[9px] font-mono text-muted-foreground flex items-center justify-between">
                  <span>{r.available.length}/{pokes.length} transferable</span>
                  <span className="opacity-70">{r.game.releaseYear}</span>
                </div>
                {r.missing.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 overflow-x-auto scroll-x">
                    <span className="text-[9px] font-mono text-muted-foreground shrink-0">missing:</span>
                    {r.missing.map(p => (
                      <img
                        key={p.id}
                        src={pixelSprite(p.id)}
                        alt={p.display}
                        title={p.display}
                        className="pixel-img w-5 h-5 object-contain shrink-0 opacity-50"
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
