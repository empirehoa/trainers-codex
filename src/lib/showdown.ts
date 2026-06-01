// ============================================================
// SHOWDOWN / POKEPASTE IMPORT-EXPORT  (Sprint 1)
// ============================================================
// Round-trip-safe conversion between our TeamMember model and the
// Pokémon Showdown text format (the same text PokePaste stores). This is the
// single highest-ROI competitive-credibility feature: every credible team tool
// (Pikalytics, Pokestats.gg, Champions Lab) speaks this format, and r/stunfisk
// dismisses anything that can't import a paste.
//
// Design notes:
//   - Species resolution is separator-agnostic. Both our internal names
//     ("charizard-mega-x") and Showdown's ("Charizard-Mega-X") collapse to the
//     same alphanumeric key, so the vast majority of forms resolve with no
//     special-casing. The few names where neither scheme matches (Ash-Greninja,
//     Necrozma fused forms, Galarian Darmanitan default, Meowstic-F) are caught
//     by ALSO indexing each mon's export slug via showdownSlug().
//   - Lower species id wins on key collision, so a default battle form
//     (Toxtricity → Amped) beats a stranger collapse to the same key.
//   - We export move/item/nature/EVs in Showdown's canonical block order so the
//     output is byte-stable: export(parse(x)) is idempotent under re-round-trip,
//     which is what the test asserts.

import { POKEMON_BY_ID, MOVES_BY_ID, MOVES_LIST, showdownSlug } from './pokemon';
import { HELD_ITEMS, NATURES, STAT_KEYS } from './constants';
import type { TeamMember, Stats, Nature, PokemonType } from './types';

const TYPES_SET = new Set<PokemonType>([
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
]);

// Showdown's canonical stat order + labels (HP / Atk / Def / SpA / SpD / Spe).
const STAT_LABEL: Record<keyof Stats, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};
const STAT_FROM_LABEL: Record<string, keyof Stats> = {
  hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe',
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function cleanRawName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '');
}

// ---- lazy reverse indexes (built once, on first import) ----

let _speciesIndex: Map<string, number> | null = null;
function speciesIndex(): Map<string, number> {
  if (_speciesIndex) return _speciesIndex;
  const m = new Map<string, number>();
  const add = (key: string, id: number) => {
    const k = norm(key);
    if (!k) return;
    const prev = m.get(k);
    if (prev === undefined || id < prev) m.set(k, id);
  };
  for (const p of Object.values(POKEMON_BY_ID)) {
    add(p.name, p.id);                          // internal: charizard-mega-x
    add(showdownSlug(cleanRawName(p.name)), p.id); // export slug: necrozma-duskmane, greninja-ash
  }
  _speciesIndex = m;
  return m;
}

let _moveIndex: Map<string, number> | null = null;
function moveIndex(): Map<string, number> {
  if (_moveIndex) return _moveIndex;
  const m = new Map<string, number>();
  for (const mv of MOVES_LIST) {
    m.set(norm(mv.name), mv.id);
    m.set(norm(mv.display), mv.id);
  }
  _moveIndex = m;
  return m;
}

let _itemIndex: Map<string, string> | null = null;
function itemIndex(): Map<string, string> {
  if (_itemIndex) return _itemIndex;
  const m = new Map<string, string>();
  for (const it of HELD_ITEMS) {
    m.set(norm(it.id), it.id);
    m.set(norm(it.label), it.id);
  }
  _itemIndex = m;
  return m;
}

const NATURE_BY_NORM: Map<string, Nature> = new Map(NATURES.map(n => [norm(n), n]));
const ITEM_LABEL: Map<string, string> = new Map(HELD_ITEMS.map(it => [it.id, it.label]));

function resolveSpecies(name: string): number | undefined {
  return speciesIndex().get(norm(name));
}

function resolveMove(name: string): number | undefined {
  // Drop Showdown move modifiers: alternatives ("Move A / Move B") and the
  // Hidden Power type suffix ("Hidden Power [Fire]" / "Hidden Power Fire").
  let n = name.split('/')[0].trim();
  n = n.replace(/\[[^\]]*\]/g, '').trim();
  let id = moveIndex().get(norm(n));
  if (id === undefined && /^hidden\s*power/i.test(n)) {
    id = moveIndex().get('hiddenpower');
  }
  return id;
}

function resolveAbility(text: string, pokemonId: number): string | undefined {
  const want = norm(text);
  const p = POKEMON_BY_ID[pokemonId];
  if (p) {
    const match = p.abilities.find(a => norm(a) === want);
    if (match) return match;
  }
  // Unknown/illegal ability for this species — keep the typed text Title-cased
  // so nothing is silently dropped on round-trip.
  return text.trim() || undefined;
}

// ---- PARSE ----

interface StatParse { [k: string]: number; }

function parseStatLine(rest: string): Partial<Stats> {
  const out: StatParse = {};
  for (const seg of rest.split('/')) {
    const m = seg.trim().match(/^(\d+)\s+(hp|atk|def|spa|spd|spe)$/i);
    if (m) {
      const key = STAT_FROM_LABEL[m[2].toLowerCase()];
      if (key) out[key] = parseInt(m[1], 10);
    }
  }
  return out as Partial<Stats>;
}

/**
 * Parse a Showdown / PokePaste team into TeamMembers. Unknown species are
 * skipped (can't place a mon we don't have). Returns up to 6 members.
 */
export function parsePokePaste(text: string): TeamMember[] {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(Boolean);

  const members: TeamMember[] = [];

  for (const block of blocks) {
    if (members.length >= 6) break;
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    // --- first line: [Nickname (]Species[)] [(Gender)] [@ Item] ---
    let head = lines[0];
    let item: string | undefined;
    const atIdx = head.lastIndexOf(' @ ');
    if (atIdx !== -1) {
      const itemText = head.slice(atIdx + 3).trim();
      head = head.slice(0, atIdx).trim();
      item = itemIndex().get(norm(itemText));
    }
    // strip trailing gender marker (M)/(F)/(N)
    head = head.replace(/\s*\((m|f|n)\)\s*$/i, '').trim();

    let nickname: string | undefined;
    let speciesText = head;
    const nickMatch = head.match(/^(.*\S)\s+\(([^)]+)\)$/);
    if (nickMatch) {
      nickname = nickMatch[1].trim();
      speciesText = nickMatch[2].trim();
    }

    const id = resolveSpecies(speciesText);
    if (id === undefined) continue;

    const member: TeamMember = { id, shiny: false };
    if (item) member.heldItem = item;
    if (nickname && norm(nickname) !== norm(speciesText)) member.nickname = nickname;

    const moves: number[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      let m: RegExpMatchArray | null;

      if (line.startsWith('-')) {
        if (moves.length < 4) {
          const mid = resolveMove(line.slice(1).trim());
          if (mid !== undefined && !moves.includes(mid)) moves.push(mid);
        }
      } else if ((m = line.match(/^Ability:\s*(.+)$/i))) {
        member.ability = resolveAbility(m[1], id);
      } else if (/^Shiny:\s*Yes/i.test(line)) {
        member.shiny = true;
      } else if ((m = line.match(/^Tera Type:\s*(.+)$/i))) {
        const t = m[1].trim().toLowerCase() as PokemonType;
        if (TYPES_SET.has(t)) member.teraType = t;
      } else if ((m = line.match(/^EVs:\s*(.+)$/i))) {
        const evs = parseStatLine(m[1]);
        if (Object.keys(evs).length) member.evs = evs;
      } else if ((m = line.match(/^IVs:\s*(.+)$/i))) {
        const ivs = parseStatLine(m[1]);
        if (Object.keys(ivs).length) member.ivs = ivs;
      } else if ((m = line.match(/^([A-Za-z]+)\s+Nature$/i))) {
        const nat = NATURE_BY_NORM.get(norm(m[1]));
        if (nat) member.nature = nat;
      }
      // Level:, Happiness:, Gigantamax:, Dynamax Level: etc. are accepted but
      // not modeled — silently ignored so they don't break the parse.
    }

    if (moves.length) member.moves = moves;
    members.push(member);
  }

  return members;
}

// ---- EXPORT ----

// Internal lowercase-hyphen name → Showdown Title-Case-Hyphen species token.
// "charizard-mega-x" → "Charizard-Mega-X", "ho-oh" → "Ho-Oh".
function speciesToken(name: string): string {
  return name
    .split('-')
    .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join('-');
}

function statBlock(label: string, stats: Partial<Stats> | undefined, predicate: (v: number) => boolean): string | null {
  if (!stats) return null;
  const parts: string[] = [];
  for (const key of STAT_KEYS) {
    const v = stats[key];
    if (v !== undefined && predicate(v)) parts.push(`${v} ${STAT_LABEL[key]}`);
  }
  return parts.length ? `${label}: ${parts.join(' / ')}` : null;
}

function exportMember(member: TeamMember): string {
  const p = POKEMON_BY_ID[member.id];
  if (!p) return '';
  const species = speciesToken(p.name);

  const lines: string[] = [];

  // line 1: [Nickname (]Species[)] [@ Item]
  let head = member.nickname ? `${member.nickname} (${species})` : species;
  if (member.heldItem) {
    const label = ITEM_LABEL.get(member.heldItem) || member.heldItem;
    head += ` @ ${label}`;
  }
  lines.push(head);

  if (member.ability) lines.push(`Ability: ${member.ability}`);
  if (member.shiny) lines.push('Shiny: Yes');
  if (member.teraType) {
    lines.push(`Tera Type: ${member.teraType[0].toUpperCase()}${member.teraType.slice(1)}`);
  }

  const evLine = statBlock('EVs', member.evs, v => v > 0);
  if (evLine) lines.push(evLine);

  if (member.nature) lines.push(`${member.nature} Nature`);

  const ivLine = statBlock('IVs', member.ivs, v => v < 31);
  if (ivLine) lines.push(ivLine);

  if (member.moves) {
    for (const mid of member.moves.slice(0, 4)) {
      const mv = MOVES_BY_ID[mid];
      if (mv) lines.push(`- ${mv.display}`);
    }
  }

  return lines.join('\n');
}

/**
 * Export a team to Showdown / PokePaste text. Null slots are skipped. Members
 * are separated by a blank line and there is no trailing newline, so the result
 * is byte-stable through re-import → re-export.
 */
export function exportPokePaste(members: (TeamMember | null)[]): string {
  return members
    .filter((m): m is TeamMember => m !== null)
    .map(exportMember)
    .filter(Boolean)
    .join('\n\n');
}
