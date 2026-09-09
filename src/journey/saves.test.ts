// Hall of Fame labels (audit A-7).
//
// A finished save stores the verdict's i18n key, and some verdict titles carry
// a `{region}` slot ("CULT HERO OF {region}"). The row used to interpolate an
// empty region and render "CULT HERO OF" — the label builder now resolves it
// from the save's own setup, for every locale and every verdict.

import { describe, expect, it } from 'vitest';
import { JOURNEY_REGIONS, VERDICTS } from './content';
import { hofLockedKey, hofVerdictLabel } from './saves';
import { LOCALES, translate, type Locale } from '@/i18n/strings';

const tr = (locale: Locale) => (key: string, vars?: Record<string, string | number | undefined>) => translate(key, locale, vars);

describe('hofVerdictLabel', () => {
  // translate() drops unknown vars, so feed the slot its own name back to see
  // which titles carry one.
  const regionVerdicts = VERDICTS.filter(v => /\{region\}/.test(translate(v.titleKey, 'en', { region: '{region}' })));

  it('the content table still has region-bearing verdicts to guard', () => {
    expect(regionVerdicts.length).toBeGreaterThan(0);
  });

  it('never ends in a dangling preposition for any region-bearing verdict, in any locale', () => {
    for (const { id: locale } of LOCALES) {
      for (const v of regionVerdicts) {
        for (const region of JOURNEY_REGIONS) {
          const label = hofVerdictLabel(
            { setup: { regionId: region.id } as never, verdictKey: v.titleKey }, tr(locale));
          expect(label, `${locale} ${v.titleKey} ${region.id}`).toContain(region.label);
          expect(label).not.toMatch(/\s(OF|DE)$/i);
          expect(label).not.toMatch(/\{region\}/);
        }
      }
    }
  });

  it('resolves the region from the save, not from a stored copy', () => {
    const label = hofVerdictLabel(
      { setup: { regionId: 'kanto' } as never, verdictKey: 'journey.verdict.cult-hero.title' }, tr('en'));
    expect(label).toBe('CULT HERO OF Kanto');
  });

  it('is empty for an unfinished save with no verdict', () => {
    expect(hofVerdictLabel({ setup: { regionId: 'kanto' } as never }, tr('en'))).toBe('');
  });
});

describe('hofLockedKey', () => {
  it('uses the singular form for exactly one career, in both complete locales', () => {
    expect(translate(hofLockedKey(1), 'en', { n: 1 })).toBe('1 finished career in your Hall of Fame');
    expect(translate(hofLockedKey(1), 'es', { n: 1 })).toBe('1 carrera terminada en tu Salón de la Fama');
  });

  it('pluralises everything else', () => {
    for (const n of [0, 2, 3, 8]) {
      expect(translate(hofLockedKey(n), 'en', { n })).toBe(`${n} finished careers in your Hall of Fame`);
    }
  });
});
