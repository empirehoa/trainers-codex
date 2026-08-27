// i18n audit.
//
// The engine and content tables reference translation keys by string. Nothing
// in TypeScript stops a typo there, and a missing key renders as a raw
// `journey.verdict.whatever.title` in the middle of the share card. These
// tests close that gap: every key any content table can emit must exist in the
// reference locale, and no locale may carry a key the reference doesn't have.

import { describe, expect, it } from 'vitest';
import {
  DECISION_CARDS, CHAPTER_BEATS, CHAPTER_TITLES, VERDICTS, ARCHETYPES, PACES,
} from '@/journey/content';
import { RANK_TIERS } from '@/journey/ranks';
import {
  LOCALES, hasKey, localeCoverage, localeKeys, referenceKeys, translate,
} from './strings';

/** Every key the content layer can ask for at runtime. */
function contentKeys(): string[] {
  const keys: string[] = [];

  for (const card of DECISION_CARDS) {
    keys.push(card.promptKey);
    for (const opt of card.options) keys.push(opt.labelKey, opt.flavorKey);
  }
  for (const v of VERDICTS) keys.push(v.titleKey, v.blurbKey);
  for (const beats of Object.values(CHAPTER_BEATS)) {
    for (const id of beats) keys.push(`journey.beat.${id}`);
  }
  for (const id of Object.values(CHAPTER_TITLES)) keys.push(`journey.chapterTitle.${id}`);
  for (const a of ARCHETYPES) keys.push(`journey.archetype.${a}`, `journey.archetype.${a}.desc`);
  for (const p of PACES) keys.push(`journey.pace.${p.id}`, `journey.pace.${p.id}.desc`);
  for (const c of ['winRate', 'titles', 'peak', 'badges', 'catches', 'shinies', 'fame', 'bond', 'durability', 'longevity']) {
    keys.push(`journey.score.${c}`);
  }
  // Rank tiers are a content table like any other — enumerated here so a typo
  // in RANK_TIERS fails the build instead of printing `journey.rank.ace` in the
  // middle of a share card.
  for (const t of RANK_TIERS) keys.push(`journey.rank.${t.id}`);
  keys.push('journey.rank.percentile', 'journey.rank.rosterRarity');
  // Battle rows and the event line, both emitted from JourneyRecap.
  for (const k of ['beat', 'lostTo', 'rematch', 'badge', 'level', 'strong', 'weak']) {
    keys.push(`journey.battle.${k}`);
  }
  keys.push('journey.recap.event', 'journey.recap.eventShiny');

  return keys;
}

describe('i18n reference locale', () => {
  it('every content key exists in English', () => {
    const missing = contentKeys().filter(k => !hasKey(k));
    expect(missing, `missing EN keys:\n${missing.join('\n')}`).toEqual([]);
  });

  it('no English value is left empty', () => {
    const empty = referenceKeys().filter(k => translate(k, 'en').trim() === '');
    expect(empty, `empty EN values: ${empty.join(', ')}`).toEqual([]);
  });

  it('no English value still contains an unresolved placeholder after interpolation', () => {
    // Feed every known var name; anything left in braces is a var the string
    // asks for that no caller supplies.
    const vars = {
      seed: 1, issue: 1, verdict: 'V', url: 'u', region: 'R', minutes: '2',
      chapter: 1, total: 1, age: 10, days: 1, ace: 'A', subject: 'S', badges: 1,
      wins: 1, losses: 1, battles: 1, catches: 1, shinies: 1, fame: 1, fatigue: 1,
      placement: 1, trainer: 'T', recruit: 'R', choice: 'c',
      caught: 1, seen: 1, name: 'N', type: 'Fire', level: 20, score: 500,
    };
    const unresolved = referenceKeys().filter(k => /\{\w+\}/.test(translate(k, 'en', vars)));
    expect(unresolved, `strings with unknown vars: ${unresolved.join(', ')}`).toEqual([]);
  });
});

describe('i18n translated locales', () => {
  it('no locale carries a key absent from the reference locale', () => {
    for (const { id } of LOCALES) {
      const strays = localeKeys(id).filter(k => !hasKey(k));
      expect(strays, `${id} has keys not in EN: ${strays.join(', ')}`).toEqual([]);
    }
  });

  it('locales marked complete are actually 100% covered', () => {
    for (const { id, complete } of LOCALES) {
      if (!complete) continue;
      const missing = referenceKeys().filter(k => !localeKeys(id).includes(k));
      expect(missing, `${id} is marked complete but missing:\n${missing.join('\n')}`).toEqual([]);
      expect(localeCoverage(id)).toBe(1);
    }
  });

  it('incomplete locales still resolve every key via the English fallback', () => {
    for (const { id, complete } of LOCALES) {
      if (complete) continue;
      for (const key of referenceKeys()) {
        const out = translate(key, id);
        expect(out, `${id}:${key} fell through to the raw key`).not.toBe(key);
        expect(out.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('an unknown key returns the key itself rather than throwing or blanking', () => {
    expect(translate('journey.nope.not.a.key', 'en')).toBe('journey.nope.not.a.key');
    expect(translate('journey.nope.not.a.key', 'ja')).toBe('journey.nope.not.a.key');
  });

  it('interpolates vars and drops missing ones without leaving braces', () => {
    expect(translate('journey.setup.seedShared', 'en', { seed: 8843 })).toContain('8843');
    expect(translate('journey.setup.seedShared', 'en')).not.toContain('{seed}');
    expect(translate('journey.result.seedLine', 'es', { seed: 42 })).toContain('42');
  });

  it('the Spanish locale is genuinely translated, not copied from English', () => {
    const sampled = ['journey.setup.heading', 'journey.result.heading', 'journey.daily.heading'];
    for (const key of sampled) {
      expect(translate(key, 'es')).not.toBe(translate(key, 'en'));
    }
  });
});
