// Unit tests for sanitizeStylePrompt — the server-side guard that strips brand /
// franchise / copy-intent tokens out of user-supplied "your style" text before it
// is fed to the image model. This is the legally load-bearing piece of the
// custom-style codex card: printable+sellable output must never be driven by a
// request to reproduce an official asset. Run with `node --test` (Node strips the
// TS types natively).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStylePrompt } from '../src/sanitize.ts';

test('null / empty input yields an empty result', () => {
  for (const v of [null, undefined, '']) {
    const r = sanitizeStylePrompt(v);
    assert.equal(r.text, '');
    assert.deepEqual(r.removed, []);
  }
});

test('a clean style description passes through untouched', () => {
  const r = sanitizeStylePrompt('moody neon cyberpunk, teal and magenta, rain-slick chrome frame');
  assert.equal(r.removed.length, 0);
  assert.match(r.text, /neon cyberpunk/);
  assert.match(r.text, /chrome frame/);
});

test('franchise / brand tokens are stripped and reported', () => {
  const r = sanitizeStylePrompt('make it look like an official Pokemon Charizard card');
  // brand + character + intent terms removed
  assert.ok(r.removed.includes('pokemon'), 'pokemon should be stripped');
  assert.ok(r.removed.includes('charizard'), 'charizard should be stripped');
  assert.ok(r.removed.includes('official'), 'official should be stripped');
  assert.doesNotMatch(r.text.toLowerCase(), /pokemon|charizard|official/);
});

test('copy-intent phrases are stripped', () => {
  const r = sanitizeStylePrompt('exact replica, 1:1, with the real logo and trade dress');
  for (const term of ['exact replica', '1:1', 'logo', 'trade dress']) {
    assert.ok(r.removed.includes(term), `${term} should be stripped`);
  }
});

test('word-boundary matching does not maul innocent substrings', () => {
  // "mews" / "realism" contain blocked terms ("mew" / "real") as substrings but
  // are different words — boundary matching must leave them intact.
  const r = sanitizeStylePrompt('soft realism, painterly brushwork');
  assert.equal(r.removed.length, 0);
  assert.match(r.text, /realism/);
});

test('trademark glyphs are dropped and whitespace collapsed', () => {
  const r = sanitizeStylePrompt('shiny™  gold   ©  finish');
  assert.doesNotMatch(r.text, /[™®©]/);
  assert.doesNotMatch(r.text, /\s{2,}/);
});

test('output is length-capped to 280 chars', () => {
  const r = sanitizeStylePrompt('x'.repeat(1000));
  assert.ok(r.text.length <= 280, `expected <=280, got ${r.text.length}`);
});

test('matching is case-insensitive', () => {
  const r = sanitizeStylePrompt('NINTENDO and PIKACHU vibes');
  assert.ok(r.removed.includes('nintendo'));
  assert.ok(r.removed.includes('pikachu'));
});
