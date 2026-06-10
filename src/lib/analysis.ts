import type {
  Pokemon, PokemonType, DefRow, OffRow, ThreatInfo, StatAggregate,
  SuggestionCandidate, CounterCandidate, Stats
} from './types';
import { TYPES, TYPE_CHART, STAT_KEYS } from './constants';

export function eff(attacker: PokemonType, defenderTypes: PokemonType[]): number {
  let m = 1;
  for (const d of defenderTypes) {
    const v = TYPE_CHART[attacker]?.[d];
    if (v !== undefined) m *= v;
  }
  return m;
}

export type Team = (Pokemon | null)[];

export function computeDefensive(team: Team): DefRow[] {
  return TYPES.map(atk => {
    const r: DefRow = { type: atk, weak4: 0, weak2: 0, neutral: 0, resist2: 0, resist4: 0, immune: 0 };
    team.forEach(p => {
      if (!p) return;
      const m = eff(atk, p.types);
      if      (m === 0)    r.immune++;
      else if (m >= 4)     r.weak4++;
      else if (m === 2)    r.weak2++;
      else if (m === 0.25) r.resist4++;
      else if (m === 0.5)  r.resist2++;
      else                 r.neutral++;
    });
    return r;
  });
}

export function computeOffensive(team: Team): OffRow[] {
  return TYPES.map(def => {
    let coverers = 0, hits = 0;
    team.forEach(p => {
      if (!p) return;
      // STAB pressure: best multiplier from p's own types against this defender
      const best = Math.max(...p.types.map(t => eff(t, [def])));
      if (best >= 2) coverers++;
      hits += best;
    });
    return { type: def, coverers, hits };
  });
}

export function computeStats(team: Team): StatAggregate {
  const total: Stats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const filled = team.filter(Boolean) as Pokemon[];
  filled.forEach(p => STAT_KEYS.forEach(k => { total[k] += p.stats[k]; }));
  const n = Math.max(filled.length, 1);
  const avg: Stats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  STAT_KEYS.forEach(k => { avg[k] = Math.round(total[k] / n); });
  return { total, avg, bst: filled.reduce((s, p) => s + p.bst, 0) };
}

// ============================================================
// TEAM-vs-TEAM MATCHUP (type + base speed)
// ============================================================
// A shared link only carries species + shiny (the share code), not movesets or
// EV spreads — so a full @smogon/calc damage matchup isn't possible from a link
// alone. Instead we give the recipient a *type-coverage* head-to-head: for each
// of their mons, how many of the opposing six it threatens with STAB
// (best own-type multiplier ≥ 2×), how many threaten it back, and base-speed
// control. That's a credible, well-understood lens (it's how players eyeball a
// matchup) and it needs nothing beyond the species in the link.

export interface MonMatchup {
  id: number;
  display: string;
  types: PokemonType[];
  spe: number;
  threatens: number;     // opposing mons this one hits ≥2× with a STAB type
  threatenedBy: number;  // opposing mons that hit this one ≥2× with their STAB
  fasterThan: number;    // opposing mons it outspeeds on base Speed
}

export interface TeamMatchup {
  mine: MonMatchup[];
  theirs: MonMatchup[];
  myThreatScore: number;    // Σ threatens across my team
  theirThreatScore: number;
  mySpeedScore: number;     // Σ fasterThan across my team
  theirSpeedScore: number;
  verdict: 'mine' | 'theirs' | 'even';
  summary: string;
}

// Best STAB multiplier of `attacker` into `defender` (max over attacker's types).
function stabPressure(attacker: Pokemon, defender: Pokemon): number {
  return Math.max(...attacker.types.map(t => eff(t, defender.types)));
}

function sideMatchup(side: Pokemon[], foe: Pokemon[]): MonMatchup[] {
  return side.map(p => {
    let threatens = 0, threatenedBy = 0, fasterThan = 0;
    foe.forEach(o => {
      if (stabPressure(p, o) >= 2) threatens++;
      if (stabPressure(o, p) >= 2) threatenedBy++;
      if (p.stats.spe > o.stats.spe) fasterThan++;
    });
    return {
      id: p.id, display: p.display, types: p.types, spe: p.stats.spe,
      threatens, threatenedBy, fasterThan,
    };
  });
}

/**
 * Head-to-head matchup of `myTeam` against `theirTeam` (either order works).
 * Empty slots are ignored. The verdict weighs offensive type pressure heavily
 * and uses base-speed control as the tiebreak.
 */
export function computeTeamMatchup(myTeam: Team, theirTeam: Team): TeamMatchup {
  const mineP = myTeam.filter(Boolean) as Pokemon[];
  const theirsP = theirTeam.filter(Boolean) as Pokemon[];

  const mine = sideMatchup(mineP, theirsP);
  const theirs = sideMatchup(theirsP, mineP);

  const myThreatScore = mine.reduce((s, m) => s + m.threatens, 0);
  const theirThreatScore = theirs.reduce((s, m) => s + m.threatens, 0);
  const mySpeedScore = mine.reduce((s, m) => s + m.fasterThan, 0);
  const theirSpeedScore = theirs.reduce((s, m) => s + m.fasterThan, 0);

  let verdict: TeamMatchup['verdict'] = 'even';
  const threatDiff = myThreatScore - theirThreatScore;
  if (threatDiff > 1) verdict = 'mine';
  else if (threatDiff < -1) verdict = 'theirs';
  else {
    // Coverage is close — let speed control decide.
    if (mySpeedScore - theirSpeedScore > 2) verdict = 'mine';
    else if (theirSpeedScore - mySpeedScore > 2) verdict = 'theirs';
  }

  const summary =
    verdict === 'mine'
      ? `Your team has the type edge — ${myThreatScore} offensive threats vs ${theirThreatScore}.`
      : verdict === 'theirs'
        ? `Their team pressures yours — ${theirThreatScore} offensive threats vs your ${myThreatScore}.`
        : `Dead even on coverage (${myThreatScore} vs ${theirThreatScore}) — it comes down to the player.`;

  return {
    mine, theirs,
    myThreatScore, theirThreatScore,
    mySpeedScore, theirSpeedScore,
    verdict, summary,
  };
}

export function computeThreats(_team: Team, defRows: DefRow[]): ThreatInfo[] {
  return defRows
    .filter(r => (r.weak2 + r.weak4) >= 2 && (r.resist2 + r.resist4 + r.immune) <= 1)
    .map(r => ({
      type: r.type,
      weakCount: r.weak2 + r.weak4,
      weak4Count: r.weak4,
      resistCount: r.resist2 + r.resist4 + r.immune,
    }))
    .sort((a, b) => b.weakCount - a.weakCount);
}

export function computeUncovered(team: Team, offRows: OffRow[]): PokemonType[] {
  if (team.filter(Boolean).length === 0) return [];
  return offRows.filter(r => r.coverers === 0).map(r => r.type);
}

export function suggestFillers(
  team: Team,
  allDetails: Record<number, Pokemon>,
  defRows: DefRow[],
  uncoveredTypes: PokemonType[]
): SuggestionCandidate[] {
  const filled = team.filter(Boolean) as Pokemon[];
  if (filled.length === 0 || filled.length >= 6) return [];
  const teamIds = new Set(filled.map(p => p.id));

  const pressureTypes: PokemonType[] = defRows
    .filter(r => (r.weak2 + r.weak4) >= 2 && (r.resist2 + r.resist4 + r.immune) <= 1)
    .map(r => r.type);
  defRows.forEach(r => {
    if ((r.weak2 + r.weak4) >= 3 && !pressureTypes.includes(r.type)) pressureTypes.push(r.type);
  });

  return Object.values(allDetails)
    .filter(p => !teamIds.has(p.id))
    .map(p => {
      let score = 0;
      const reasons: string[] = [];
      pressureTypes.forEach(atk => {
        const m = eff(atk, p.types);
        if (m === 0)        { score += 3;   reasons.push(`immune to ${atk}`); }
        else if (m === 0.25){ score += 2.5; reasons.push(`4× resists ${atk}`); }
        else if (m === 0.5) { score += 2;   reasons.push(`resists ${atk}`); }
        else if (m === 2)   { score -= 1.2; }
        else if (m === 4)   { score -= 2.5; }
      });
      uncoveredTypes.forEach(def => {
        const best = Math.max(...p.types.map(t => TYPE_CHART[t]?.[def] ?? 1));
        if (best >= 4)      { score += 2.5; reasons.push(`STAB hits ${def} 4×`); }
        else if (best >= 2) { score += 1.8; reasons.push(`STAB hits ${def}`); }
      });
      score += (p.bst - 400) / 250;
      return { p, score, reasons: reasons.slice(0, 3) };
    })
    .filter(c => c.score > 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

// COUNTER TEAM — given current team, find 6 mons that beat it
export function suggestCounterTeam(
  team: Team,
  allDetails: Record<number, Pokemon>
): CounterCandidate[] {
  const opp = team.filter(Boolean) as Pokemon[];
  if (opp.length === 0) return [];
  const oppIds = new Set(opp.map(p => p.id));

  const stabCount: Record<string, number> = {};
  opp.forEach(p => p.types.forEach(t => { stabCount[t] = (stabCount[t] || 0) + 1; }));

  const scored = Object.values(allDetails)
    .filter(p => !oppIds.has(p.id) && p.bst >= 440)
    .map(p => {
      let score = 0;
      const reasons: string[] = [];

      Object.entries(stabCount).forEach(([atk, count]) => {
        const m = eff(atk as PokemonType, p.types);
        if (m === 0)        { score += 3.5 * count; reasons.push(`immune to ${atk}`); }
        else if (m === 0.25){ score += 3.0 * count; reasons.push(`4× resists ${atk}`); }
        else if (m === 0.5) { score += 2.0 * count; reasons.push(`resists ${atk}`); }
        else if (m === 2)   { score -= 1.5 * count; }
        else if (m === 4)   { score -= 3.0 * count; }
      });

      let coveredCount = 0;
      opp.forEach(o => {
        const best = Math.max(...p.types.map(t => eff(t, o.types)));
        if (best >= 4)      { score += 3; coveredCount++; }
        else if (best >= 2) { score += 2; coveredCount++; }
      });
      if (coveredCount >= 3) reasons.push(`hits ${coveredCount}/${opp.length} super-effective`);
      else if (coveredCount >= 1) reasons.push(`hits ${coveredCount} super-effective`);

      score += (p.bst - 500) / 120;
      if (p.stats.spe >= 110) { score += 1.0; reasons.push('outspeeds most'); }

      return { p, score, reasons: reasons.slice(0, 3) };
    });

  scored.sort((a, b) => b.score - a.score);
  const picked: CounterCandidate[] = [];
  const typeUsage: Record<string, number> = {};
  for (const c of scored) {
    if (picked.length >= 6) break;
    let penalty = 0;
    c.p.types.forEach(t => { penalty += (typeUsage[t] || 0) * 1.4; });
    if (c.score - penalty < 2) continue;
    picked.push(c);
    c.p.types.forEach(t => { typeUsage[t] = (typeUsage[t] || 0) + 1; });
  }
  return picked;
}

// RANDOM TEAM — diverse types, BST floor
export function generateRandomTeam(
  allDetails: Record<number, Pokemon>,
  opts: { minBST?: number; monotype?: PokemonType } = {}
): Pokemon[] {
  const minBST = opts.minBST ?? 450;
  const monotype = opts.monotype;
  const pool = Object.values(allDetails).filter(p => {
    if (p.bst < minBST) return false;
    if (monotype) return p.types.includes(monotype);
    return true;
  });
  if (pool.length < 6) return [];

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picked: Pokemon[] = [];
  const typeUsage: Record<string, number> = {};

  for (const p of shuffled) {
    if (picked.length >= 6) break;
    let overlap = 0;
    p.types.forEach(t => { overlap = Math.max(overlap, typeUsage[t] || 0); });
    if (overlap >= (monotype ? 6 : 2)) continue;
    picked.push(p);
    p.types.forEach(t => { typeUsage[t] = (typeUsage[t] || 0) + 1; });
  }
  // Relax constraint if still under 6
  if (picked.length < 6) {
    for (const p of shuffled) {
      if (picked.length >= 6) break;
      if (picked.includes(p)) continue;
      let overlap = 0;
      p.types.forEach(t => { overlap = Math.max(overlap, typeUsage[t] || 0); });
      if (overlap >= 3) continue;
      picked.push(p);
      p.types.forEach(t => { typeUsage[t] = (typeUsage[t] || 0) + 1; });
    }
  }
  // Fill any remaining
  if (picked.length < 6) {
    for (const p of shuffled) {
      if (picked.length >= 6) break;
      if (!picked.includes(p)) picked.push(p);
    }
  }
  return picked.slice(0, 6);
}

// Showdown export now takes the rich team members (with chosen ability/moves)
import type { TeamMember, Move } from './types';

export function showdownExport(
  team: Team,
  membersBySlot?: (TeamMember | null)[],
  movesById?: Record<number, Move>
): string {
  const filled = team.filter(Boolean) as Pokemon[];
  if (filled.length === 0) return '';
  return filled.map((p, slotIdx) => {
    // Locate matching member by id
    const member = membersBySlot
      ? membersBySlot.find(m => m && m.id === p.id) || null
      : null;
    const ability = member?.ability || p.abilities[0] || 'No Ability';
    const nickname = member?.nickname ? `${member.nickname} (${p.display})` : p.display;
    const shinyLine = member?.shiny ? '\nShiny: Yes' : '';
    let moveLines = '- Move 1\n- Move 2\n- Move 3\n- Move 4';
    if (member?.moves && member.moves.length && movesById) {
      moveLines = member.moves
        .slice(0, 4)
        .map(mid => `- ${movesById[mid]?.display || 'Move'}`)
        .join('\n');
      while (moveLines.split('\n').length < 4) moveLines += '\n- ';
    }
    void slotIdx;
    return `${nickname}\nAbility: ${ability}${shinyLine}\nEVs: 4 HP / 252 Atk / 252 Spe\nAdamant Nature\n${moveLines}`;
  }).join('\n\n');
}

// Share code format v2:
//   ids only:     "6-9-3-25-143-149"               (back-compat)
//   with shinies: "6s-9-3s-25-143-149s"           (mons with 's' are shiny)
export function buildShareCode(members: (TeamMember | null)[]): string {
  return members.map(m => {
    if (!m) return '0';
    return m.shiny ? `${m.id}s` : `${m.id}`;
  }).join('-');
}

export function parseShareCode(code: string): (TeamMember | null)[] | null {
  if (!code) return null;
  const parts = code.split(/[-,]/);
  if (parts.length !== 6) return null;
  return parts.map(part => {
    const shiny = part.endsWith('s');
    const n = parseInt(shiny ? part.slice(0, -1) : part, 10);
    if (!n || n <= 0 || n > 1025) return null;
    return { id: n, shiny };
  });
}
