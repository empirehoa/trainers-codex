#!/usr/bin/env node
// Rebuild src/data/pokemon-data.json + src/data/learnsets.json from the PokeAPI
// api-data mirror. Run from the repo root:
//
//   node scripts/fetch-forms.mjs                 # full re-sweep (every entry)
//   node scripts/fetch-forms.mjs --dry           # report, write nothing
//   node scripts/fetch-forms.mjs --out <dir>     # write the two JSONs elsewhere
//   node scripts/fetch-forms.mjs --cache <dir>   # where fetched JSON is kept
//
// Replaces the three ad-hoc /tmp scripts the v4/v5 build used (fetch-forms /
// merge-forms / fetch-form-learnsets), which were never committed and so had
// to be rediscovered every time the dataset moved. This one is idempotent:
// it fetches EVERYTHING, so a stale learnset on an existing species is fixed
// by the same run that adds a new form.
//
// Source: https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2
// (CORS-friendly, no rate limit). ~1,350 small JSON files; the cache directory
// makes a second run instant.
//
// What it keeps stable on purpose:
//   * `d` (display name) and `form` of an entry that already exists are
//     preserved — the hand-tuned ones ("Mr. Mime", "Nidoran♀", 'origin' vs
//     'form') must not churn under a mechanical derivation.
//   * moves.json is NOT touched. Learnsets are filtered to the moves it knows
//     (the 18 Shadow moves from XD are deliberately absent).
//   * species.json is NOT touched (base-species flags; forms inherit).
//
// What it decides:
//   * Which PokeAPI entries are Pokémon the builder should list. Totem forms
//     and in-battle states (Wishiwashi School, Mimikyu Busted, Cramorant
//     Gulping/Gorging, Eiscue Noice, Morpeko Hangry) are excluded — they are
//     not selectable team members in any game. See EXCLUDED below.
//   * Abilities for entries PokeAPI has not filled in yet (the newest Megas).
//     ABILITY_OVERRIDES carries the published ones; an entry with none stays
//     `a: []`, which every renderer already handles ("None recorded.").
//
// Learnsets are stored as the entry's OWN moves, encoded with
// src/lib/learnset.ts (fixed-width base-36 deltas — the format comment lives
// there). A form whose list is empty (Gigantamax, the newest Megas) inherits
// its base species' at read time — storing the copy would cost ~20 KB of
// bundle for no information.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Node 22 strips the types natively (the same way `node scripts/gen-seo-pages.ts` runs).
import { encodeLearnset, decodeLearnset } from '../src/lib/learnset.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const argAfter = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : fallback; };
const CACHE = argAfter('--cache', join(ROOT, 'node_modules/.cache/pokeapi'));
const OUT = argAfter('--out', join(ROOT, 'src/data'));
const CONCURRENCY = 12;

// ---------------------------------------------------------------------------
// Inclusion rules
// ---------------------------------------------------------------------------

/** PokeAPI entries that are not team-selectable Pokémon in any game. */
const EXCLUDED = [
  /-totem(-|$)/,                 // Sun/Moon totem sizes
  /^wishiwashi-school$/,         // Schooling: in-battle state
  /^mimikyu-busted$/,            // Disguise broken: in-battle state
  /^cramorant-(gulping|gorging)$/,
  /^eiscue-noice$/,
  /^morpeko-hangry$/,
];

/**
 * Form category from the PokeAPI slug. First match wins; order matters only
 * for the regional-vs-gmax overlap (there is none today). Entries that already
 * exist keep their committed category regardless of what this returns.
 */
function classifyForm(name) {
  if (/-mega(-|$)/.test(name)) return 'mega';
  if (/-primal$/.test(name)) return 'primal';
  if (/-gmax$/.test(name)) return 'gigantamax';
  if (/-alola(-|$)/.test(name)) return 'alolan';
  if (/-galar(-|$)/.test(name)) return 'galarian';
  if (/-hisui(-|$)/.test(name)) return 'hisuian';
  if (/-paldea(-|$)/.test(name)) return 'paldean';
  if (/-therian$/.test(name)) return 'therian';
  if (/-origin$/.test(name)) return 'origin';
  if (/^kyurem-(black|white)$|^necrozma-(dusk|dawn)$|^calyrex-(ice|shadow)$/.test(name)) return 'fusion';
  if (/-crowned$/.test(name)) return 'crowned';
  if (/-eternamax$/.test(name)) return 'eternamax';
  return 'form';
}

/**
 * Abilities for entries PokeAPI publishes with an empty ability list. Sourced
 * from the Pokémon Champions ability listings (Serebii, Regulation M-C era);
 * keyed by PokeAPI slug so a renumbering upstream cannot mis-assign them.
 * Only entries with a published ability appear — nothing here is guessed.
 */
const ABILITY_OVERRIDES = {
  'raichu-mega-x':       ['Electric Surge'],
  'raichu-mega-y':       ['No Guard'],
  'chimecho-mega':       ['Levitate'],
  'absol-mega-z':        ['Sharpness'],
  'staraptor-mega':      ['Contrary'],
  'garchomp-mega-z':     ['Levitate'],
  'lucario-mega-z':      ['Aura Guard'],
  'golurk-mega':         ['Unseen Fist'],
  'meowstic-male-mega':  ['Trace'],
  'meowstic-female-mega':['Trace'],
  'crabominable-mega':   ['Iron Fist'],
  'golisopod-mega':      ['Tough Claws'],
  'drampa-mega':         ['Berserk'],
  'falinks-mega':        ['Defiant'],
  'scovillain-mega':     ['Spicy Spray'],
  'glimmora-mega':       ['Adaptability'],
  'baxcalibur-mega':     ['Thermal Exchange'],
  // Champions Megas that shipped in v5 with abilities already filled in are
  // listed too, so a future PokeAPI regression cannot blank them.
  'clefable-mega':       ['Magic Bounce'],
  'victreebel-mega':     ['Innards Out'],
  'starmie-mega':        ['Huge Power'],
  'dragonite-mega':      ['Multiscale'],
  'meganium-mega':       ['Mega Sol'],
  'feraligatr-mega':     ['Dragonize'],
  'skarmory-mega':       ['Stalwart'],
  'froslass-mega':       ['Snow Warning'],
  'emboar-mega':         ['Mold Breaker'],
  'excadrill-mega':      ['Piercing Drill'],
  'scolipede-mega':      ['Shell Armor'],
  'scrafty-mega':        ['Intimidate'],
  'eelektross-mega':     ['Eelevate'],
  'chandelure-mega':     ['Infiltrator'],
  'chesnaught-mega':     ['Bulletproof'],
  'delphox-mega':        ['Levitate'],
  'greninja-mega':       ['Protean'],
  'pyroar-mega':         ['Fire Mane'],
  'floette-mega':        ['Fairy Aura'],
  'malamar-mega':        ['Contrary'],
  'barbaracle-mega':     ['Tough Claws'],
  'dragalge-mega':       ['Regenerator'],
  'hawlucha-mega':       ['No Guard'],
};

// ---------------------------------------------------------------------------
// Fetch layer
// ---------------------------------------------------------------------------

async function getJson(path) {
  const file = join(CACHE, path.replace(/\//g, '_') + '.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url = `${API}/${path}/index.json`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const text = await res.text();
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

const titleCase = s => s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const round1 = n => Math.round(n * 10) / 10;

function idOf(url) {
  return Number(url.replace(/\/$/, '').split('/').pop());
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const existing = JSON.parse(readFileSync(join(ROOT, 'src/data/pokemon-data.json'), 'utf8'));
const existingLearnsets = JSON.parse(readFileSync(join(ROOT, 'src/data/learnsets.json'), 'utf8'));
const moves = JSON.parse(readFileSync(join(ROOT, 'src/data/moves.json'), 'utf8'));
const species = JSON.parse(readFileSync(join(ROOT, 'src/data/species.json'), 'utf8'));
const knownMoves = new Set(Object.keys(moves).map(Number));

const index = await getJson('pokemon');
if (!index?.results?.length) throw new Error('empty pokemon index');

const wanted = index.results
  .map(r => ({ id: idOf(r.url), name: r.name }))
  .filter(r => !EXCLUDED.some(rx => rx.test(r.name)))
  .sort((a, b) => a.id - b.id);

console.log(`index: ${index.results.length} entries, ${wanted.length} after exclusions, ${Object.keys(existing).length} committed`);

let done = 0;
const fetched = await mapLimit(wanted, CONCURRENCY, async (w) => {
  const p = await getJson(`pokemon/${w.id}`);
  if (++done % 200 === 0) process.stdout.write(`  fetched ${done}/${wanted.length}\n`);
  return p;
});

const data = {};
const learnsets = {};
const report = { added: [], removed: [], changed: [], learnsetChanged: 0, emptyLearnsets: [], noAbilities: [] };

for (const p of fetched) {
  if (!p) continue;
  const id = p.id;
  const prev = existing[String(id)];
  const speciesId = idOf(p.species.url);
  const isForm = id > 10000;
  const base = species[String(speciesId)] ?? {};

  const stats = p.stats.map(s => s.base_stat);
  let abilities = [...p.abilities]
    .sort((a, b) => a.slot - b.slot)
    .map(a => titleCase(a.ability.name));
  if (abilities.length === 0 && ABILITY_OVERRIDES[p.name]) abilities = ABILITY_OVERRIDES[p.name];
  // Preserve a hand-corrected ability list when PokeAPI is blank and we have one.
  if (abilities.length === 0 && prev?.a?.length) abilities = prev.a;

  const entry = {
    i: id,
    n: p.name,
    d: prev?.d ?? titleCase(p.name),
    t: p.types.sort((a, b) => a.slot - b.slot).map(t => t.type.name),
    s: stats,
    b: stats.reduce((a, b) => a + b, 0),
    a: abilities,
    h: round1(p.height / 10),
    w: round1(p.weight / 10),
  };
  if (base.l) entry.leg = 1;
  if (base.m) entry.myth = 1;
  if (base.b) entry.baby = 1;
  if (isForm) {
    entry.sp = speciesId;
    entry.form = prev?.form ?? classifyForm(p.name);
  }

  const moveIds = [...new Set(p.moves.map(m => idOf(m.move.url)))]
    .filter(m => knownMoves.has(m))
    .sort((a, b) => a - b);

  data[String(id)] = entry;
  learnsets[String(id)] = encodeLearnset(moveIds);

  if (!prev) report.added.push(`${id} ${p.name}`);
  else if (JSON.stringify(prev) !== JSON.stringify(entry)) report.changed.push(`${id} ${p.name}`);
  // The committed table may still be in the v5 array shape on the first run.
  const prevRaw = existingLearnsets[String(id)];
  const prevIds = Array.isArray(prevRaw) ? prevRaw : decodeLearnset(prevRaw);
  if (JSON.stringify(prevIds) !== JSON.stringify(moveIds)) report.learnsetChanged++;
  if (moveIds.length === 0) report.emptyLearnsets.push(p.name);
  if (abilities.length === 0) report.noAbilities.push(p.name);
}
for (const id of Object.keys(existing)) if (!data[id]) report.removed.push(`${id} ${existing[id].n}`);

// Every form must point at a base species that exists in the set.
for (const e of Object.values(data)) {
  if (e.sp && !data[String(e.sp)]) throw new Error(`${e.n}: base species ${e.sp} missing from dataset`);
}

const dataJson = JSON.stringify(data);
const learnJson = JSON.stringify(learnsets);
const before = readFileSync(join(ROOT, 'src/data/pokemon-data.json')).length
  + readFileSync(join(ROOT, 'src/data/learnsets.json')).length;

console.log(`\nentries: ${Object.keys(data).length} (+${report.added.length} / -${report.removed.length} / ~${report.changed.length} changed)`);
if (report.added.length) console.log('  added:   ' + report.added.join(', '));
if (report.removed.length) console.log('  removed: ' + report.removed.join(', '));
console.log(`learnsets changed: ${report.learnsetChanged}; empty (inherit from base at read time): ${report.emptyLearnsets.length}`);
console.log(`  empty: ${report.emptyLearnsets.join(', ')}`);
console.log(`no abilities published: ${report.noAbilities.length} — ${report.noAbilities.join(', ') || 'none'}`);
console.log(`bytes: ${before} → ${dataJson.length + learnJson.length} (${dataJson.length + learnJson.length - before >= 0 ? '+' : ''}${dataJson.length + learnJson.length - before})`);

if (DRY) {
  console.log('\n--dry: nothing written');
} else {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'pokemon-data.json'), dataJson);
  writeFileSync(join(OUT, 'learnsets.json'), learnJson);
  console.log(`\nwrote ${join(OUT, 'pokemon-data.json')}, ${join(OUT, 'learnsets.json')}`);
  console.log('next: node worker/scripts/gen-species-names.mjs && pnpm test:unit');
}
