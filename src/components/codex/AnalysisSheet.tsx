import { useState } from 'react';
import {
  Shield, Sword, BarChart3, Sparkles, AlertTriangle, Target, Save, Share2, X,
  Wand2
} from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from '@/components/ui/tooltip';
import type {
  Pokemon, DefRow, OffRow, ThreatInfo, StatAggregate, PokemonType,
  SuggestionCandidate, CounterCandidate, TeamMember
} from '@/lib/types';
import { TYPE_COLORS, STAT_KEYS, STAT_LABELS } from '@/lib/constants';
import { pixelSprite } from '@/lib/pokemon';
import { TypePill } from './TypePill';
import { GameCompatibilitySection } from './GameCompatibilitySection';
import { MatchupSection } from './MatchupSection';

interface AnalysisSheetProps {
  open: boolean;
  onClose: () => void;
  team: (Pokemon | null)[];
  members: (TeamMember | null)[];
  teamName: string;
  setTeamName: (n: string) => void;
  defRows: DefRow[];
  offRows: OffRow[];
  statAgg: StatAggregate;
  threats: ThreatInfo[];
  uncovered: PokemonType[];
  suggestions: SuggestionCandidate[];
  counters: CounterCandidate[];
  onAddSuggestion: (p: Pokemon) => void;
  onRemove: (idx: number) => void;
  onClear: () => void;
  onShare: () => void;
  onSaveToLibrary: (name: string) => void;
  onBuildCounter: () => void;
  onSelectMon: (p: Pokemon) => void;
  onViewTCG: (p: Pokemon) => void;
  onPoster: () => void;
}

export function AnalysisSheet({
  open, onClose, team, members, teamName, setTeamName,
  defRows, offRows, statAgg, threats, uncovered, suggestions, counters,
  onAddSuggestion, onRemove, onClear, onShare, onSaveToLibrary, onBuildCounter, onSelectMon,
  onViewTCG, onPoster
}: AnalysisSheetProps) {
  const [showCounters, setShowCounters] = useState(false);
  const filled = team.filter(Boolean) as Pokemon[];

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto scroll-y bg-card border-l p-0 sm:max-w-2xl"
      >
        <SheetHeader className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex-row items-start justify-between gap-2 space-y-0">
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-display text-lg text-primary lowercase">team analysis</SheetTitle>
            <SheetDescription className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              // {filled.length}/6 members
            </SheetDescription>
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="// untitled team"
              className="mt-1 bg-transparent border-none px-0 py-0 h-auto font-mono text-[11px] focus-visible:ring-0"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon" variant="outline"
                    onClick={() => onSaveToLibrary(teamName || 'Untitled')}
                    disabled={filled.length === 0}
                    className="w-8 h-8"
                  >
                    <Save size={13} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save to library</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" onClick={onPoster} disabled={filled.length === 0} className="w-8 h-8">
                    <Wand2 size={13} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Poster studio</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="outline" onClick={onShare} disabled={filled.length === 0} className="w-8 h-8">
                    <Share2 size={13} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share team</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {filled.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onClear}
                      className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-destructive">
                clear
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={onClose} className="w-8 h-8">
              <X size={14} />
            </Button>
          </div>
        </SheetHeader>

        <div className="p-4 space-y-5">
          {/* Roster */}
          <section>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {team.map((p, i) => {
                const m = members[i];
                const shiny = m?.shiny;
                if (!p) {
                  return (
                    <div key={i} className="text-center">
                      <div className="aspect-square rounded border border-dashed flex items-center justify-center font-mono text-xs text-muted-foreground">
                        —
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={i} className="text-center">
                    <div
                      className="aspect-square rounded border overflow-hidden relative flex items-center justify-center group"
                      style={{
                        borderColor: shiny ? '#fde047aa' : TYPE_COLORS[p.types[0]] + '99',
                        background: `radial-gradient(circle, ${TYPE_COLORS[p.types[0]]}22, transparent)`,
                        boxShadow: shiny ? '0 0 8px rgba(253,224,71,0.3)' : undefined,
                      }}
                    >
                      <button onClick={() => onSelectMon(p)} className="absolute inset-0">
                        <img src={pixelSprite(p.id, shiny)} alt={p.display}
                             className="pixel-img w-full h-full object-contain p-1"
                             onError={(e) => { if (shiny) (e.currentTarget as HTMLImageElement).src = pixelSprite(p.id); }} />
                      </button>
                      {shiny && (
                        <Sparkles size={9} className="absolute top-0.5 left-0.5 pointer-events-none"
                                  style={{ color: '#fde047', filter: 'drop-shadow(0 0 2px rgba(253,224,71,0.8))' }} />
                      )}
                      <div className="absolute bottom-0 right-0 left-0 flex justify-between opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => onViewTCG(p)} title="TCG cards"
                                className="px-1 py-0.5 text-[10px] font-mono"
                                style={{ background: 'hsl(var(--card)/0.95)', color: 'hsl(var(--primary))' }}>
                          TCG
                        </button>
                        <button onClick={() => onRemove(i)} title="Remove"
                                className="px-1 py-0.5"
                                style={{ background: 'hsl(var(--destructive)/0.95)', color: '#fff' }}>
                          <X size={8} />
                        </button>
                      </div>
                    </div>
                    <div className="font-mono text-[10px] mt-1 truncate text-muted-foreground">
                      {m?.nickname || p.display}
                    </div>
                    {m?.moves && m.moves.length > 0 && (
                      <div className="font-mono text-[10px] truncate text-primary/70">
                        {m.moves.length} moves set
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {filled.length > 0 && (
            <GameCompatibilitySection team={members} />
          )}

          {filled.length > 0 && (
            <MatchupSection team={members} />
          )}

          {filled.length > 0 && (
            <>
              {/* Stat aggregate */}
              <section>
                <Heading icon={<BarChart3 size={13} />} title="aggregate stats" />
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className="border rounded p-2.5" style={{ borderColor: 'hsl(var(--border))' }}>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">// totals</div>
                    {STAT_KEYS.map(k => (
                      <div key={k} className="flex justify-between text-xs font-mono">
                        <span className="text-muted-foreground">{STAT_LABELS[k]}</span>
                        <span>{statAgg.total[k]}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs font-mono mt-1 pt-1 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                      <span className="text-primary font-bold">BST</span>
                      <span className="text-primary font-bold">{statAgg.bst}</span>
                    </div>
                  </div>
                  <div className="border rounded p-2.5" style={{ borderColor: 'hsl(var(--border))' }}>
                    <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">// per-member avg</div>
                    {STAT_KEYS.map(k => (
                      <div key={k} className="flex justify-between text-xs font-mono">
                        <span className="text-muted-foreground">{STAT_LABELS[k]}</span>
                        <span>{statAgg.avg[k]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Threats */}
              {threats.length > 0 && (
                <section>
                  <Heading icon={<AlertTriangle size={13} className="text-destructive" />} title="threats" sub="types where 2+ members are weak with little resistance" />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {threats.map(t => (
                      <div key={t.type} className="border rounded px-2 py-1 flex items-center gap-1.5"
                           style={{ borderColor: 'hsl(var(--destructive)/0.5)', background: 'hsl(var(--destructive)/0.1)' }}>
                        <TypePill type={t.type} />
                        <span className="font-mono text-[10px] text-destructive">
                          {t.weak4Count > 0 && `${t.weak4Count}×4 `}{t.weakCount} weak / {t.resistCount} resist
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Suggestions (fillers) */}
              {suggestions.length > 0 && filled.length < 6 && (
                <section>
                  <Heading icon={<Sparkles size={13} />} title="suggested fillers" sub="based on current gaps" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                    {suggestions.map(({ p, reasons }) => (
                      <button key={p.id} onClick={() => { onAddSuggestion(p); }}
                              className="text-left rounded border transition p-2 hover:border-primary bg-card"
                              style={{ borderColor: 'hsl(var(--border))' }}>
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 shrink-0 rounded relative flex items-center justify-center"
                               style={{ background: `radial-gradient(circle, ${TYPE_COLORS[p.types[0]]}33, transparent)` }}>
                            <img src={pixelSprite(p.id)} alt="" className="pixel-img w-full h-full object-contain" loading="lazy" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs truncate">{p.display}</div>
                            <div className="flex gap-1 mt-0.5">{p.types.map(t => <TypePill key={t} type={t} sm />)}</div>
                          </div>
                        </div>
                        {reasons.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {reasons.slice(0, 2).map((r, i) => (
                              <li key={i} className="text-[10px] font-mono truncate text-muted-foreground">· {r}</li>
                            ))}
                          </ul>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Defensive matrix */}
              <section>
                <Heading icon={<Shield size={13} />} title="defensive matrix" sub="how each attacking type fares against your team" />
                <div className="mt-2 overflow-x-auto scroll-x">
                  <div className="grid grid-cols-1 gap-0.5 min-w-[480px]">
                    <div className="grid grid-cols-[80px_repeat(6,1fr)] gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      <div></div>
                      <div className="text-center">4×</div>
                      <div className="text-center">2×</div>
                      <div className="text-center">1×</div>
                      <div className="text-center">½×</div>
                      <div className="text-center">¼×</div>
                      <div className="text-center">0×</div>
                    </div>
                    {defRows.map(r => {
                      const bad = r.weak4 + r.weak2;
                      const good = r.resist2 + r.resist4 + r.immune;
                      const tone = bad > good ? 'destructive' : good > bad ? '#7fc04e' : 'foreground';
                      return (
                        <div key={r.type} className="grid grid-cols-[80px_repeat(6,1fr)] gap-1 items-center text-xs font-mono py-0.5">
                          <div><TypePill type={r.type} sm /></div>
                          <Cell n={r.weak4} color="#7f1d1d" />
                          <Cell n={r.weak2} color="#a16207" />
                          <Cell n={r.neutral} color="hsl(var(--muted))" />
                          <Cell n={r.resist2} color="#15803d44" />
                          <Cell n={r.resist4} color="#15803d" />
                          <Cell n={r.immune} color="#1e3a8a" tone={tone} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Offensive coverage */}
              <section>
                <Heading icon={<Sword size={13} />} title="offensive coverage" sub="team members with super-effective STAB" />
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-2">
                  {offRows.map(r => {
                    const color = r.coverers >= 2 ? '#7fc04e' : r.coverers === 1 ? '#f4ae3c' : 'hsl(var(--border))';
                    return (
                      <div key={r.type} className="rounded border p-1.5 text-center"
                           style={{ borderColor: color + '90', background: color + '12' }}>
                        <TypePill type={r.type} sm />
                        <div className="font-mono mt-1 text-sm" style={{ color }}>{r.coverers}</div>
                      </div>
                    );
                  })}
                </div>
                {uncovered.length > 0 && (
                  <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                    // no super-effective STAB against:&nbsp;
                    {uncovered.map((t, i) => (
                      <span key={t}>{i > 0 && ', '}<TypePill type={t} sm /></span>
                    ))}
                  </div>
                )}
              </section>

              {/* COUNTER TEAM */}
              {filled.length >= 3 && counters.length >= 3 && (
                <section
                  className="border rounded-md p-3"
                  style={{
                    borderColor: 'hsl(var(--destructive)/0.4)',
                    background: 'linear-gradient(180deg, hsl(var(--destructive)/0.08), transparent)',
                  }}
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <Heading icon={<Target size={13} className="text-destructive" />} title="counter team" sub="6 pokémon that would beat this lineup" />
                    <Button variant="outline" size="sm" onClick={() => setShowCounters(v => !v)}
                            className="h-6 px-2 text-[10px] font-mono uppercase tracking-wider">
                      {showCounters ? 'hide' : 'reveal'}
                    </Button>
                  </div>
                  {showCounters && (
                    <>
                      <p className="text-[10px] font-mono mb-3 text-muted-foreground">
                        // ai-suggested adversaries · scored on resistance to your STAB types and offensive pressure
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {counters.map(({ p, reasons }) => (
                          <button key={p.id} onClick={() => onSelectMon(p)}
                                  className="text-left rounded border transition p-2 hover:border-destructive bg-card"
                                  style={{ borderColor: 'hsl(var(--border))' }}>
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 shrink-0 rounded flex items-center justify-center"
                                   style={{ background: `radial-gradient(circle, ${TYPE_COLORS[p.types[0]]}33, transparent)` }}>
                                <img src={pixelSprite(p.id)} alt="" className="pixel-img w-full h-full object-contain" loading="lazy" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs truncate">{p.display}</div>
                                <div className="flex gap-1 mt-0.5">{p.types.map(t => <TypePill key={t} type={t} sm />)}</div>
                              </div>
                            </div>
                            {reasons.length > 0 && (
                              <ul className="mt-1.5 space-y-0.5">
                                {reasons.slice(0, 2).map((r, i) => (
                                  <li key={i} className="text-[10px] font-mono truncate text-muted-foreground">· {r}</li>
                                ))}
                              </ul>
                            )}
                          </button>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        onClick={onBuildCounter}
                        className="mt-3 w-full text-destructive border-destructive/40 hover:bg-destructive/10"
                      >
                        <Target size={12} className="mr-1.5" /> Build this counter team
                      </Button>
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Heading({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <div className="self-center text-primary">{icon}</div>
      <h3 className="font-display text-sm text-primary">{title}</h3>
      {sub && <div className="text-[10px] font-mono text-muted-foreground">// {sub}</div>}
    </div>
  );
}

// Used in unused locals workaround — must be used somewhere
const _statAggSilencer = (s: StatAggregate) => s;
void _statAggSilencer;

function Cell({ n, color, tone }: { n: number; color: string; tone?: string }) {
  return (
    <div
      className="text-center py-1 rounded text-xs"
      style={{
        background: n > 0 ? color : 'transparent',
        color: n > 0 ? '#fff' : 'hsl(var(--muted-foreground))',
        opacity: n > 0 ? 1 : 0.3,
        border: tone ? `1px solid ${tone}` : undefined,
      }}
    >
      {n}
    </div>
  );
}
