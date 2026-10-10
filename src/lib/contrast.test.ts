import { describe, it, expect } from 'vitest';
import { contrastRatio, readableOn, blend, TYPE_TEXT_COLORS, CARD_DARK, CARD_LIGHT, PILL_TINT_ALPHA } from './contrast';
import { TYPE_COLORS } from './constants';
import type { PokemonType } from './types';

/** hsl() token from index.css → #rrggbb, so the theme tokens can be asserted. */
function hslToken(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

describe('contrastRatio', () => {
  it('matches the WCAG reference points', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});

describe('readableOn', () => {
  it('returns the input when it already passes', () => {
    expect(readableOn('#ffffff', '#000000')).toBe('#ffffff');
  });
  it('lifts a dark colour on a dark ground and drops a light one on a light ground', () => {
    expect(contrastRatio(readableOn('#704170', CARD_DARK), CARD_DARK)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(readableOn('#fac000', CARD_LIGHT), CARD_LIGHT)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('TYPE_TEXT_COLORS', () => {
  it('every type reads at AA on its own pill in both themes', () => {
    for (const t of Object.keys(TYPE_COLORS) as PokemonType[]) {
      const fill = TYPE_COLORS[t];
      expect(contrastRatio(TYPE_TEXT_COLORS[t].dark, blend(fill, CARD_DARK, PILL_TINT_ALPHA))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(TYPE_TEXT_COLORS[t].light, blend(fill, CARD_LIGHT, PILL_TINT_ALPHA))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('index.css text tokens', () => {
  // Values mirror src/index.css; a change there must be reflected here.
  const dark = { background: hslToken(30, 17, 4), card: hslToken(28, 18, 9), destructiveText: hslToken(0, 75, 62), mutedForeground: hslToken(34, 12, 53) };
  const light = { background: hslToken(40, 35, 96), card: hslToken(40, 30, 99), destructiveText: hslToken(0, 65, 38), mutedForeground: hslToken(32, 14, 38) };
  it('--destructive-text and --muted-foreground meet AA on both surfaces in both themes', () => {
    for (const th of [dark, light]) {
      for (const bg of [th.background, th.card]) {
        expect(contrastRatio(th.destructiveText, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(th.mutedForeground, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('the raw --destructive fill is why the text token exists', () => {
    expect(contrastRatio(hslToken(0, 70, 45), dark.card)).toBeLessThan(4.5);
  });
});
