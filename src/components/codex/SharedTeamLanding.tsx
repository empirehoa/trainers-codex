import { useMemo, useState } from 'react';
import { Swords, Download, X, Trophy, Gauge, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TypePill } from '@/components/codex/TypePill';
import { POKEMON_BY_ID, pixelSprite, padId } from '@/lib/pokemon';
import { computeTeamMatchup, type MonMatchup } from '@/lib/analysis';
import type { Pokemon, TeamMember } from '@/lib/types';

interface SharedTeamLandingProps {
  members: (TeamMember | null)[];   // the shared team (species + shiny only)
  teamName?: string;
  by?: string;
  myMembers: (TeamMember | null)[]; // the recipient's own current team
  onLoad: () => void;               // load the shared team into the builder
  onDismiss: () => void;            // close the landing, keep my own app state
}

function membersToTeam(members: (TeamMember | null)[]): (Pokemon | null)[] {
  return members.map(m => (m ? POKEMON_BY_ID[m.id] || null : null));
}

function RosterMon({ m, shiny }: { m: Pokemon; shiny?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card/60 px-2 py-1.5"
         style={{ borderColor: 'hsl(var(--border))' }}>
      <img
        src={pixelSprite(m.id, shiny)}
        alt={m.display}
        width={40} height={40}
        className="pixel-img w-10 h-10 object-contain shrink-0"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
      />
      <div className="min-w-0">
        <div className="font-mono text-xs text-foreground truncate">
          {m.display}{shiny ? ' ✦' : ''}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {m.types.map(t => <TypePill key={t} type={t} sm />)}
          <span className="text-[9px] font-mono text-muted-foreground ml-1">{padId(m.id)} · BST {m.bst}</span>
        </div>
      </div>
    </div>
  );
}

// One side's per-mon matchup line: how many it threatens / is threatened by.
function MatchupRow({ row, shinyById }: { row: MonMatchup; shinyById: Set<number> }) {
  const p = POKEMON_BY_ID[row.id];
  if (!p) return null;
  const edge = row.threatens - row.threatenedBy;
  const edgeColor = edge > 0 ? 'text-emerald-400' : edge < 0 ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="flex items-center gap-2 py-1 border-b last:border-b-0" style={{ borderColor: 'hsl(var(--border)/0.5)' }}>
      <img src={pixelSprite(row.id, shinyById.has(row.id))} alt={row.display}
           width={28} height={28} className="pixel-img w-7 h-7 object-contain shrink-0"
           onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
      <span className="font-mono text-[11px] text-foreground flex-1 truncate">{row.display}</span>
      <span className="font-mono text-[10px] text-emerald-400/90 flex items-center gap-0.5" title="opposing mons this threatens (≥2×)">
        <Zap size={10} /> {row.threatens}
      </span>
      <span className="font-mono text-[10px] text-red-400/80 flex items-center gap-0.5" title="opposing mons that threaten this (≥2×)">
        <Swords size={10} /> {row.threatenedBy}
      </span>
      <span className={`font-mono text-[10px] w-7 text-right ${edgeColor}`} title="net type edge">
        {edge > 0 ? `+${edge}` : edge}
      </span>
    </div>
  );
}

export function SharedTeamLanding({
  members, teamName, by, myMembers, onLoad, onDismiss,
}: SharedTeamLandingProps) {
  const [showMatchup, setShowMatchup] = useState(false);

  const sharedTeam = useMemo(() => membersToTeam(members), [members]);
  const myTeam = useMemo(() => membersToTeam(myMembers), [myMembers]);
  const sharedMons = sharedTeam.filter(Boolean) as Pokemon[];
  const hasMyTeam = myTeam.some(Boolean);

  const sharedShiny = useMemo(
    () => new Set(members.filter(m => m?.shiny).map(m => m!.id)),
    [members]
  );
  const myShiny = useMemo(
    () => new Set(myMembers.filter(m => m?.shiny).map(m => m!.id)),
    [myMembers]
  );

  // computeTeamMatchup(mine, theirs): "mine" verdict ⇒ recipient's team wins.
  const matchup = useMemo(
    () => (hasMyTeam ? computeTeamMatchup(myTeam, sharedTeam) : null),
    [myTeam, sharedTeam, hasMyTeam]
  );

  const verdictBanner = matchup && (
    matchup.verdict === 'mine'
      ? { text: 'Your team has the edge', cls: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' }
      : matchup.verdict === 'theirs'
        ? { text: 'The shared team has the edge', cls: 'text-red-400 border-red-500/40 bg-red-500/10' }
        : { text: 'Dead even — down to the player', cls: 'text-amber-400 border-amber-500/40 bg-amber-500/10' }
  );

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-background crt-scan crt-vignette grain">
      <div className="min-h-full flex items-start sm:items-center justify-center p-4">
        <div className="w-full max-w-2xl my-4 rounded-lg border bg-card shadow-2xl"
             style={{ borderColor: 'hsl(var(--primary)/0.4)' }}>

          {/* Header */}
          <div className="relative px-5 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
            >
              <X size={18} />
            </button>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
              // a trainer shared a team with you
            </div>
            <h1 className="font-display text-2xl text-foreground lowercase mt-1">
              {teamName ? teamName : 'shared team'}
            </h1>
            <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
              {by ? `from ${by} · ` : ''}{sharedMons.length} member{sharedMons.length === 1 ? '' : 's'} · trainer&apos;s codex
            </div>
          </div>

          {/* Shared roster */}
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sharedMons.map((m, i) => (
                <RosterMon key={`${m.id}-${i}`} m={m} shiny={sharedShiny.has(m.id)} />
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2 mt-5">
              <Button onClick={onLoad} className="flex-1 font-mono text-xs">
                <Download size={13} className="mr-1.5" /> load this team
              </Button>
              <Button
                variant={showMatchup ? 'default' : 'outline'}
                onClick={() => setShowMatchup(v => !v)}
                disabled={!hasMyTeam}
                title={hasMyTeam ? 'compare against your current team' : 'build a team first to battle'}
                className="flex-1 font-mono text-xs"
              >
                <Swords size={13} className="mr-1.5" />
                {showMatchup ? 'hide matchup' : 'battle my team'}
              </Button>
            </div>
            {!hasMyTeam && (
              <p className="text-[10px] font-mono text-muted-foreground mt-2 text-center">
                load this team or build your own first, then come back to run a head-to-head
              </p>
            )}

            {/* Matchup */}
            {showMatchup && matchup && (
              <div className="mt-5 rounded-md border p-4" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted)/0.3)' }}>
                {verdictBanner && (
                  <div className={`flex items-center gap-2 rounded border px-3 py-2 mb-3 font-mono text-xs ${verdictBanner.cls}`}>
                    <Trophy size={13} /> {verdictBanner.text}
                  </div>
                )}
                <p className="font-mono text-[11px] text-muted-foreground mb-3">{matchup.summary}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-400/90 mb-1">your team</div>
                    {matchup.mine.map((r, i) => <MatchupRow key={`me-${r.id}-${i}`} row={r} shinyById={myShiny} />)}
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-red-400/80 mb-1">shared team</div>
                    {matchup.theirs.map((r, i) => <MatchupRow key={`them-${r.id}-${i}`} row={r} shinyById={sharedShiny} />)}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t font-mono text-[10px] text-muted-foreground"
                     style={{ borderColor: 'hsl(var(--border))' }}>
                  <span className="flex items-center gap-1"><Zap size={10} className="text-emerald-400" /> threatens (≥2×)</span>
                  <span className="flex items-center gap-1"><Swords size={10} className="text-red-400" /> threatened by</span>
                  <span className="flex items-center gap-1"><Gauge size={10} /> speed {matchup.mySpeedScore}–{matchup.theirSpeedScore}</span>
                </div>
                <p className="text-[9px] font-mono text-muted-foreground/70 mt-2 text-center">
                  type-coverage + base-speed preview · open the analysis panel after loading for full damage calc
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
