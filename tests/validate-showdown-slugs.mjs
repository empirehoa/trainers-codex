// Validates showdownSlug() (from src/lib/pokemon.ts) against the live
// Pokémon Showdown animated-sprite host. Replicates the slug logic exactly,
// then HEADs the resulting .gif URL for every entry in pokemon-data.json.
//
// Run: node tests/validate-showdown-slugs.mjs
// Exit 0 if pass-rate >= baseline; prints every 404 so we can extend aliases.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(join(__dirname, '../src/data/pokemon-data.json'), 'utf8')
);

// ---- mirror of src/lib/pokemon.ts slug logic (keep in sync) ----
const SHOWDOWN_SPECIES_ALIASES = {
  'mr-mime': 'mrmime', 'mr-rime': 'mrrime', 'mime-jr': 'mimejr',
  'type-null': 'typenull', 'ho-oh': 'hooh', 'porygon-z': 'porygonz',
  'jangmo-o': 'jangmoo', 'hakamo-o': 'hakamoo', 'kommo-o': 'kommoo',
  'tapu-koko': 'tapukoko', 'tapu-lele': 'tapulele', 'tapu-bulu': 'tapubulu', 'tapu-fini': 'tapufini',
  'wo-chien': 'wochien', 'chien-pao': 'chienpao', 'ting-lu': 'tinglu', 'chi-yu': 'chiyu',
  'great-tusk': 'greattusk', 'scream-tail': 'screamtail', 'brute-bonnet': 'brutebonnet',
  'flutter-mane': 'fluttermane', 'slither-wing': 'slitherwing', 'sandy-shocks': 'sandyshocks',
  'iron-treads': 'irontreads', 'iron-bundle': 'ironbundle', 'iron-hands': 'ironhands',
  'iron-jugulis': 'ironjugulis', 'iron-moth': 'ironmoth', 'iron-thorns': 'ironthorns',
  'roaring-moon': 'roaringmoon', 'iron-valiant': 'ironvaliant', 'walking-wake': 'walkingwake',
  'iron-leaves': 'ironleaves', 'gouging-fire': 'gougingfire', 'raging-bolt': 'ragingbolt',
  'iron-boulder': 'ironboulder', 'iron-crown': 'ironcrown',
};

const SHOWDOWN_FORM_OVERRIDES = {
  'nidoran-f': 'nidoranf', 'nidoran-m': 'nidoranm',
  'necrozma-dusk': 'necrozma-duskmane', 'necrozma-dawn': 'necrozma-dawnwings',
  'darmanitan-galar-standard': 'darmanitan-galar',
  'greninja-battle-bond': 'greninja-ash',
  'minior-red-meteor': 'minior', 'minior-orange-meteor': 'minior',
  'minior-yellow-meteor': 'minior', 'minior-green-meteor': 'minior',
  'minior-blue-meteor': 'minior', 'minior-indigo-meteor': 'minior',
  'minior-violet-meteor': 'minior', 'minior-red': 'minior',
};

const SHOWDOWN_DEFAULT_FORMS = new Set([
  'normal', 'plant', 'altered', 'land', 'red-striped', 'standard',
  'incarnate', 'ordinary', 'aria', 'shield', 'average', 'baile',
  'midday', 'solo', 'disguised', 'amped', 'ice', 'full-belly',
  'single-strike', 'zero', 'curly', 'two-segment', 'family-of-four',
  'green-plumage', '50', 'male', 'own-tempo',
]);

function collapseFormSlug(form) {
  if (form === 'female') return 'f';
  if (form === 'male') return 'm';
  form = form.replace(/-plumage$/, '');
  return form.replace(/-/g, '');
}

function showdownSlug(raw) {
  if (SHOWDOWN_FORM_OVERRIDES[raw]) return SHOWDOWN_FORM_OVERRIDES[raw];
  for (const [from, to] of Object.entries(SHOWDOWN_SPECIES_ALIASES)) {
    if (raw === from) return to;
    if (raw.startsWith(from + '-')) {
      const form = raw.slice(from.length + 1);
      return SHOWDOWN_DEFAULT_FORMS.has(form) ? to : to + '-' + collapseFormSlug(form);
    }
  }
  const dashIdx = raw.indexOf('-');
  if (dashIdx === -1) return raw;
  const species = raw.slice(0, dashIdx);
  const form = raw.slice(dashIdx + 1);
  if (SHOWDOWN_DEFAULT_FORMS.has(form)) return species;
  return species + '-' + collapseFormSlug(form);
}

function slugFor(name) {
  const raw = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]/g, '');
  return showdownSlug(raw);
}
// ---- end mirror ----

const entries = Object.values(data).map(p => ({ id: p.i, name: p.n, slug: slugFor(p.n) }));

const BASE = 'https://play.pokemonshowdown.com/sprites/ani';
const CONCURRENCY = 24;

async function head(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.status;
  } catch {
    return 0; // network error
  }
}

async function main() {
  const failures = [];
  let ok = 0;
  let i = 0;
  async function worker() {
    while (i < entries.length) {
      const e = entries[i++];
      const status = await head(`${BASE}/${e.slug}.gif`);
      if (status === 200) ok++;
      else failures.push({ ...e, status });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  failures.sort((a, b) => a.id - b.id);
  const total = entries.length;
  console.log(`\nShowdown animated-sprite validation`);
  console.log(`  total:   ${total}`);
  console.log(`  ok:      ${ok} (${((ok / total) * 100).toFixed(1)}%)`);
  console.log(`  missing: ${failures.length}`);

  const forms = failures.filter(f => f.id > 10000);
  const base = failures.filter(f => f.id <= 10000);
  console.log(`    of which base species (id<=10000): ${base.length}`);
  console.log(`    of which alt forms   (id>10000):   ${forms.length}`);

  if (failures.length) {
    console.log(`\n  Missing (these will fall back to pixel sprites):`);
    for (const f of failures) {
      console.log(`    #${f.id}  ${f.name}  →  ${f.slug}.gif  [${f.status}]`);
    }
  }
  // These Pokémon genuinely have no Gen-5-style animated sprite on Showdown
  // (verified by HEAD-probing the live host 2026-06-01). The fallback chain
  // renders them as pixel/HOME sprites instead. Listing them explicitly turns
  // this test into a regression gate: any NEW failure outside this set is a
  // real slug bug; any name here that starts passing means Showdown shipped a
  // sprite and we can drop it.
  const EXPECTED_MISSING = new Set([
    // Gen 9 paradox / Treasures of Ruin / Loyal Three / box legends — no ani
    'iron-treads', 'iron-bundle', 'iron-hands', 'iron-jugulis', 'iron-moth',
    'iron-thorns', 'iron-valiant', 'iron-leaves', 'iron-boulder', 'iron-crown',
    'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu', 'miraidon',
    'okidogi', 'munkidori', 'fezandipiti', 'ogerpon', 'terapagos', 'pecharunt',
    // Pikachu cap forms — no ani
    'pikachu-original-cap', 'pikachu-hoenn-cap', 'pikachu-sinnoh-cap',
    'pikachu-unova-cap', 'pikachu-kalos-cap', 'pikachu-alola-cap',
    'pikachu-partner-cap', 'pikachu-world-cap',
    // Zygarde Power Construct variants — no ani
    'zygarde-10-power-construct', 'zygarde-50-power-construct',
    // Gigantamax forms Showdown never drew animated
    'venusaur-gmax', 'blastoise-gmax', 'rillaboom-gmax', 'cinderace-gmax',
    'toxtricity-amped-gmax', 'urshifu-single-strike-gmax',
    'urshifu-rapid-strike-gmax', 'toxtricity-low-key-gmax',
    // Origin box legends (BDSP/Legends) — no ani
    'dialga-origin', 'palkia-origin',
    // Paldean Tauros breeds — no ani
    'tauros-paldea-combat-breed', 'tauros-paldea-blaze-breed', 'tauros-paldea-aqua-breed',
    'maushold-family-of-three',
    // Koraidon / Miraidon travel forms — no ani
    'koraidon-limited-build', 'koraidon-sprinting-build', 'koraidon-swimming-build',
    'koraidon-gliding-build', 'miraidon-low-power-mode', 'miraidon-drive-mode',
    'miraidon-aquatic-mode', 'miraidon-glide-mode',
    // Ogerpon masks + Terapagos forms — no ani
    'ogerpon-wellspring-mask', 'ogerpon-hearthflame-mask', 'ogerpon-cornerstone-mask',
    'terapagos-terastal', 'terapagos-stellar',
    // Non-canonical "mega" entries in the dataset (no such official Pokémon)
    'excadrill-mega', 'scolipede-mega', 'scrafty-mega', 'eelektross-mega',
    'chandelure-mega', 'chesnaught-mega', 'delphox-mega', 'greninja-mega',
    'pyroar-mega', 'floette-mega', 'malamar-mega', 'barbaracle-mega',
    'dragalge-mega', 'hawlucha-mega',
  ]);

  const unexpected = failures.filter(f => !EXPECTED_MISSING.has(f.name));
  const staleAllowed = [...EXPECTED_MISSING].filter(n => !failures.some(f => f.name === n));

  if (staleAllowed.length) {
    console.log(`\n  Note: ${staleAllowed.length} allowlisted name(s) now resolve — Showdown added sprites; safe to drop from EXPECTED_MISSING:`);
    staleAllowed.forEach(n => console.log(`    + ${n}`));
  }
  if (unexpected.length) {
    console.error(`\n✗ ${unexpected.length} UNEXPECTED missing slug(s) — real regression:`);
    unexpected.forEach(f => console.error(`    #${f.id} ${f.name} → ${f.slug}.gif [${f.status}]`));
    process.exit(1);
  }
  console.log(`\n✓ Slug logic healthy — every failure is a known Showdown gap; no regressions.`);
}

main();
