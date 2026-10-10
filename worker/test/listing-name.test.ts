// Listing-name sanitization — the paid-surface legal backstop (audit finding
// D-5). Stripe line-item names and Printful product titles must never carry
// the franchise mark, the publisher names, or a species name, whatever the
// client sent. Also pins the generated species list to the data file so a
// data refresh without `node worker/scripts/gen-species-names.mjs` fails here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripTrademark, safeListingLabel, normalizeListing, GENERIC_LISTING_LABEL } from '../src/pf-catalog.ts';
import { SPECIES_NAMES, SPECIES_NAME_COUNT } from '../src/species-names.ts';
import { worker, makeEnv, ctx, multipartReq, stubFetch, blobOf, PNG_BYTES } from './_harness.ts';
// printful.ts is not a leaf (it imports ./index extensionless), so it must load
// AFTER the harness has registered the resolve hook — hence the dynamic import.
const { composeProductName } = await import('../src/printful.ts');

const FORBIDDEN = /pok[eè]?\s?mon|\bpok[eé]\b|nintendo|game\s?freak|creatures|pikachu|charizard|mew|tapu|flabebe|mime/i;

const D5_TABLE: Array<[string, string]> = [
  ['Pikachu Squad', 'Squad'],
  ['Nintendo Fans', 'Fans'],
  ['Game Freak crew', 'crew'],
  ['Poke mon', ''],
  ['Pokèmon', ''],
  ['pokemonmasters', ''],
  ['Charizard & Co', 'Co'],
  ['Pokémon GO raid team', 'raid team'],
  ['The Pokémon Company', ''],
  ['Creatures Inc. 2026', '2026'],
  ['POKÉMON™', ''],
  ['Mr. Mime fan club', 'fan club'],
  ['Tapu Koko Island', 'Island'],
  ['Flabébé garden', 'garden'],
  ['Mew two', 'two'],
  ['Kissimmee Gym', 'Kissimmee Gym'],
  ['Team Rocket', 'Team Rocket'],
  ['Poker Night', 'Poker Night'],
];

test('D-5 table: brand, publisher and species terms are stripped; innocent text survives with its casing', () => {
  for (const [input, expected] of D5_TABLE) {
    const out = stripTrademark(input);
    assert.equal(out, expected, JSON.stringify(input));
    assert.equal(FORBIDDEN.test(out), false, `${JSON.stringify(input)} → ${JSON.stringify(out)}`);
  }
});

test('safeListingLabel fails closed to the generic label when nothing survives', () => {
  for (const input of ['Poke mon', 'Pokèmon', 'pokemonmasters', 'Pikachu', '', null, undefined, '···']) {
    assert.equal(safeListingLabel(input), GENERIC_LISTING_LABEL, String(input));
  }
  assert.equal(safeListingLabel('Kissimmee Gym'), 'Kissimmee Gym');
});

test('every species display name is stripped, alone and embedded, in any casing and with diacritics', () => {
  const data = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/data/pokemon-data.json', import.meta.url)), 'utf8')) as Record<string, { d: string }>;
  const entries = Object.values(data);
  assert.equal(entries.length, SPECIES_NAME_COUNT);
  for (const { d } of entries) {
    assert.equal(stripTrademark(d), '', `alone: ${d}`);
    assert.equal(stripTrademark(d.toUpperCase()), '', `upper: ${d}`);
    assert.equal(stripTrademark(`Team ${d} Rules`), 'Team Rules', `embedded: ${d}`);
  }
});

test('the generated species list matches the data file entry-for-entry (drift check)', () => {
  const data = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/data/pokemon-data.json', import.meta.url)), 'utf8')) as Record<string, { d: string }>;
  const entries = Object.values(data);
  assert.equal(SPECIES_NAMES.length, entries.length, 'run: node worker/scripts/gen-species-names.mjs');
  assert.equal(SPECIES_NAME_COUNT, entries.length);
  entries.forEach((e, i) => {
    assert.equal(SPECIES_NAMES[i], normalizeListing(e.d), `entry ${i} (${e.d}) — regenerate species-names.ts`);
  });
});

test('composeProductName never emits a blocked term and falls back to the generic label', () => {
  const rows: Array<[Record<string, string | undefined>, string]> = [
    [{ teamName: 'Pikachu Squad' }, 'Trainer Crest · Squad'],
    [{ gymName: 'Nintendo Fans', teamName: 'Charizard & Co' }, 'Trainer Crest · Fans'],
    [{ teamName: 'Game Freak crew', region: 'Kanto' }, 'Trainer Crest · crew · Kanto'],
    [{ teamName: 'Poke mon' }, `Trainer Crest · ${GENERIC_LISTING_LABEL}`],
    [{ teamName: 'Pokèmon', region: 'Pokémon GO' }, `Trainer Crest · ${GENERIC_LISTING_LABEL}`],
    [{ teamName: 'pokemonmasters' }, `Trainer Crest · ${GENERIC_LISTING_LABEL}`],
    [{}, 'Trainer Crest'],
  ];
  for (const [parts, expected] of rows) {
    const out = composeProductName({ designLabel: 'Trainer Crest', ...parts });
    assert.equal(out, expected, JSON.stringify(parts));
    assert.equal(FORBIDDEN.test(out), false, out);
  }
});

test('the Stripe product_data.name path strips the team name and maps the design id (end-to-end)', async () => {
  const env = makeEnv({ MERCH_CHECKOUT: '1' });
  const fx = stubFetch(() => ({ id: 'cs_test_new0000000000000000000000', url: 'https://checkout.stripe.com/c/pay/x' }));
  try {
    const res = await worker.fetch(multipartReq('/merch/checkout', {
      product: 'mug-11oz-white', design: 'Pokémon <script>', markup: '100', expectedRetail: '9.99',
      returnUrl: 'https://trainerscodex.com/', metadata: JSON.stringify({ teamName: 'Pikachu & Nintendo Fans · Pokèmon GO' }),
      file: blobOf(PNG_BYTES, 'image/png'),
    }), env, ctx);
    assert.equal(res.status, 200, await res.clone().text());
    const params = new URLSearchParams(fx.calls[0].body!);
    const name = params.get('line_items[0][price_data][product_data][name]')!;
    assert.equal(name, "Trainer's Codex · Trainer Codex · mug-11oz-white · Fans");
    assert.equal(FORBIDDEN.test(name), false);
    assert.equal(params.get('metadata[productName]'), name);
  } finally { fx.restore(); }
});
