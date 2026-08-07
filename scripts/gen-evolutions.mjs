// Generate src/data/evolutions.json — a compact, national-dex-keyed evolution
// map for Journey Mode. Base-form species only (journey rosters never hold
// alternate forms). Run from the repo root:
//
//   node scripts/gen-evolutions.mjs
//
// Requires the @pkmn/dex devDependency. The output JSON is committed and
// inlined into the bundle, so this only reruns when the dex changes.
//
// Shape:  { "<fromNum>": [{ id:<toNum>, to:"<Display>", level:<n|null>, how:"<label>" }, ... ] }

import { Dex } from '@pkmn/dex';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const data = JSON.parse(readFileSync(join(ROOT, 'src/data/pokemon-data.json'), 'utf8'));
const arr = Array.isArray(data) ? data : Object.values(data);
const ourIds = new Set(arr.map(e => e.i));
const displayById = new Map(arr.map(e => [e.i, e.d]));

const gen = Dex.forGen(9);
const map = {};
let edges = 0;

for (const sp of gen.species.all()) {
  if (!sp.exists || !sp.evos || sp.evos.length === 0) continue;
  if (sp.baseSpecies && sp.baseSpecies !== sp.name) continue; // parent must be a base form
  const fromNum = sp.num;
  if (!ourIds.has(fromNum)) continue;

  const evos = [];
  for (const evoName of sp.evos) {
    const child = gen.species.get(evoName);
    if (!child || !child.exists) continue;
    if (child.baseSpecies && child.baseSpecies !== child.name) continue; // target must be a base form
    const toNum = child.num;
    if (!ourIds.has(toNum) || toNum === fromNum) continue;

    let level = null, how = 'level';
    if (child.evoLevel) { level = child.evoLevel; how = 'level'; }
    else if (child.evoType === 'useItem') how = 'item';
    else if (child.evoType === 'trade') how = 'trade';
    else if (child.evoType === 'levelFriendship') how = 'friendship';
    else if (child.evoType === 'levelMove' || child.evoType === 'levelExtra') how = 'level';
    else if (child.evoType) how = 'special';

    evos.push({ id: toNum, to: displayById.get(toNum) || child.name, level, how });
  }
  if (evos.length) { map[String(fromNum)] = evos; edges += evos.length; }
}

writeFileSync(join(ROOT, 'src/data/evolutions.json'), JSON.stringify(map));
console.log(`evolutions.json: ${Object.keys(map).length} evolving species, ${edges} edges`);
