#!/usr/bin/env node
// Build src/data/champions-regulation.json — the set of Trainer's Codex entry
// ids that are usable in Pokémon Champions Ranked Battle under the current
// Regulation — from the committed Serebii rows in scripts/data/champions-usable.json.
//
//   node scripts/gen-champions-roster.mjs          # write
//   node scripts/gen-champions-roster.mjs --dry    # report only
//
// WHY A GENERATOR: Serebii is the only complete public source for what is
// usable in Champions (the game's own roster grows per Regulation) and it is
// not fetchable from CI, so the scraped rows are committed and this script
// turns them into ids. The rows carry Serebii's icon code ("026-a", "448-mz")
// and display name ("Alolan Raichu", "Mega Lucario Z"); the mapping to our
// PokeAPI-derived slugs is the only non-trivial part and lives in resolve().
//
// SEMANTICS: a Regulation's usable set is cumulative — everything introduced in
// M-A stays usable in M-B and M-C — so the shipped list is the union of every
// regulation's "Newly Useable Pokémon" table up to and including the current
// one. The Recruit Ranch "Regular Roster" lists what can be recruited in-game
// and is unioned in too: the regulation tables name a species once ("Rotom")
// while the roster spells out its usable forms (Heat/Wash/Frost/Fan/Mow Rotom,
// Midnight/Dusk Lycanroc, …), so each source carries ids the other lacks.
//
// Cosmetic variants our dataset folds into the base species (Vivillon patterns,
// Florges colours, Alcremie creams, Furfrou trims, Polteageist/Sinistcha
// antique forms) resolve to the base id, which is already present. Each is
// logged so a future dataset that adds them is noticed.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

const src = JSON.parse(readFileSync(join(ROOT, 'scripts/data/champions-usable.json'), 'utf8'));
const data = JSON.parse(readFileSync(join(ROOT, 'src/data/pokemon-data.json'), 'utf8'));
const entries = Object.values(data);
const bySlug = new Map(entries.map(e => [e.n, e.i]));
const formsOf = (num) => entries.filter(e => e.sp === num);

/** The base species slug for a national-dex number (our base entries have id === number). */
function baseSlug(num) {
  const e = data[String(num)];
  if (!e) throw new Error(`no base entry for #${num}`);
  return e.n;
}

/** Species root of a slug: "tauros-paldea-combat-breed" → "tauros", "mr-mime" → "mr-mime". */
function root(num) {
  const slug = baseSlug(num);
  // Default-form base slugs carry a form token ("meowstic-male", "lycanroc-midday",
  // "toxtricity-amped"); forms share the species token before it.
  const forms = formsOf(num);
  if (forms.length === 0) return slug;
  let prefix = slug;
  while (prefix.includes('-') && !forms.every(f => f.n.startsWith(prefix + '-'))) {
    prefix = prefix.slice(0, prefix.lastIndexOf('-'));
  }
  return prefix;
}

const find = (slug, ctx) => {
  const id = bySlug.get(slug);
  if (id === undefined) throw new Error(`${ctx}: no entry "${slug}"`);
  return id;
};

const notes = [];

/**
 * Serebii (code, name) → one or more entry ids. Throws on anything it does not
 * recognise rather than guessing: a new icon suffix must be classified here.
 */
function resolve(code, name) {
  const m = /^(\d+)(?:-([a-z]+))?$/.exec(code);
  if (!m) throw new Error(`bad code ${code}`);
  const num = Number(m[1]);
  const suf = m[2] ?? '';
  const ctx = `${code} ${name}`;
  const r = root(num);
  const paren = /\(([^)]+)\)/.exec(name)?.[1];

  // Mega Evolutions — by name, then X/Y/Z by suffix.
  if (/^Mega /.test(name)) {
    const tail = suf === 'mx' ? '-mega-x' : suf === 'my' ? '-mega-y' : suf === 'mz' ? '-mega-z' : '-mega';
    const slugs = formsOf(num).map(f => f.n).filter(s => s.endsWith(tail) && (tail !== '-mega' || !/-mega-[xyz]$/.test(s)));
    if (slugs.length === 0) throw new Error(`${ctx}: no Mega form ending ${tail}`);
    // Mega Meowstic / Mega Tatsugiri: one Serebii row, one entry per base form.
    return slugs.map(s => find(s, ctx));
  }

  if (suf === '') {
    if (paren) {
      // Named variant on a plain code: only Sinistcha Masterpiece today.
      const variant = formsOf(num).find(f => f.n.endsWith('-' + paren.toLowerCase().split(' ')[0]));
      if (variant) return [variant.i];
      notes.push(`${ctx}: cosmetic variant not in dataset → base`);
    }
    return [num];
  }

  // Species with their own code vocabulary.
  if (num === 479) { // Rotom appliances
    const map = { h: 'heat', w: 'wash', f: 'frost', s: 'fan', m: 'mow' };
    return [find(`rotom-${map[suf]}`, ctx)];
  }
  if (num === 128) { // Paldean Tauros breeds (p = Combat, b = Blaze, a = Aqua)
    const breed = suf === 'p' && /Aqua/.test(name) ? 'aqua' : suf === 'p' && /Blaze/.test(name) ? 'blaze'
      : suf === 'p' ? 'combat' : suf === 'b' ? 'blaze' : suf === 'a' ? 'aqua' : null;
    if (!breed) throw new Error(`${ctx}: unknown Tauros breed`);
    return [find(`tauros-paldea-${breed}-breed`, ctx)];
  }
  if (num === 745) return [find(`lycanroc-${suf === 'm' ? 'midnight' : 'dusk'}`, ctx)];
  if (num === 711) { // Gourgeist sizes; Serebii reuses "l" for Jumbo
    const size = /Jumbo/.test(name) ? 'super' : suf === 's' ? 'small' : 'large';
    return [find(`gourgeist-${size}`, ctx)];
  }
  if (num === 670 && suf === 'e') return [find('floette-eternal', ctx)];
  if (num === 849 && suf === 'l') return [find('toxtricity-low-key', ctx)];
  if (num === 931) { // Squawkabilly plumage (green is the base)
    const colour = { b: 'blue', y: 'yellow', w: 'white' }[suf];
    return [find(`squawkabilly-${colour}-plumage`, ctx)];
  }
  if (suf === 'f') {
    const f = formsOf(num).find(x => x.n === `${r}-female`);
    if (f) return [f.i];
    if (num === 925) return [num]; // Maushold Family of Four IS our base entry
    throw new Error(`${ctx}: no female form`);
  }
  const regional = { a: 'alola', g: 'galar', h: 'hisui', p: 'paldea' }[suf];
  if (regional) {
    const slug = formsOf(num).map(f => f.n).find(s => s === `${r}-${regional}` || s.startsWith(`${r}-${regional}-`));
    if (slug) return [find(slug, ctx)];
  }
  // Cosmetic-only variants with no entry of their own.
  if (formsOf(num).every(f => f.form === 'gigantamax' || f.form === 'mega') || formsOf(num).length === 0) {
    notes.push(`${ctx}: cosmetic variant not in dataset → base`);
    return [num];
  }
  throw new Error(`${ctx}: unresolved suffix "${suf}" (forms: ${formsOf(num).map(f => f.n).join(', ')})`);
}

// ---------------------------------------------------------------------------

const current = src.regulations[src.regulations.length - 1];
const ids = new Set();
const perReg = {};
for (const reg of src.regulations) {
  perReg[reg.id] = new Set();
  for (const row of reg.rows) for (const id of resolve(row.code, row.name)) { ids.add(id); perReg[reg.id].add(id); }
}
const rosterIds = new Set();
for (const row of src.roster.rows) for (const id of resolve(row.code, row.name)) rosterIds.add(id);
const rosterOnly = [...rosterIds].filter(id => !ids.has(id));
const regulationOnlyBases = [...ids].filter(id => id <= 10000 && !rosterIds.has(id));
for (const id of rosterIds) ids.add(id);

const sorted = [...ids].sort((a, b) => a - b);
const forms = sorted.filter(id => id > 10000);
const megas = sorted.filter(id => data[String(id)].form === 'mega');

console.log(`regulations: ${src.regulations.map(r => `${r.id} +${perReg[r.id].size}`).join(', ')}; roster adds ${rosterOnly.length} → ${sorted.length} usable ids`);
console.log(`  ${sorted.length - forms.length} base species · ${forms.length} forms (${megas.length} Megas)`);
console.log(`  roster-only forms: ${rosterOnly.map(i => data[String(i)].n).join(', ') || 'none'}`);
console.log(`  usable but not recruitable (regulation-only species): ${regulationOnlyBases.length}`);
for (const n of notes) console.log('  note: ' + n);
for (const id of sorted) {
  const e = data[String(id)];
  // Eternal Flower Floette is in Champions while plain Floette is not; a form
  // without its base is legitimate, so this is informational.
  if (e.sp && !ids.has(e.sp)) console.log(`  note: form ${e.n} usable while base #${e.sp} is not`);
  if (e.form === 'gigantamax') throw new Error(`Gigantamax ${e.n} resolved as usable — Champions has no Dynamax`);
}

const out = {
  id: current.id,
  label: current.label,
  game: 'champions',
  start: current.start,
  end: current.end,
  seasons: current.seasons ?? [],
  source: current.url,
  fetched: src.fetched,
  ids: sorted,
};

if (DRY) {
  console.log('--dry: nothing written');
} else {
  writeFileSync(join(ROOT, 'src/data/champions-regulation.json'), JSON.stringify(out));
  console.log(`wrote src/data/champions-regulation.json (${JSON.stringify(out).length} bytes)`);
}
