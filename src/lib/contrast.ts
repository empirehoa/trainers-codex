import { TYPE_COLORS } from './constants';
import type { PokemonType } from './types';

// ============================================================
// READABLE TYPE COLOURS
// ============================================================
//
// TYPE_COLORS are the canonical fills and stay untouched. As 10px TEXT several
// of them fail WCAG AA on the app's surfaces: ghost #735797 is 3.0:1 on the
// dark card, dark #705746 2.9:1, and on the light theme electric #F7D02C is
// 1.5:1 against cream. The pill therefore carries two derived text colours —
// the same hue and saturation, lightness walked until the contrast against the
// theme's card clears 4.5:1 — and index.css picks one per theme.

/** Relative luminance of an `#rrggbb` colour (WCAG 2.x). */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * The nearest lightness of `hex` (same hue and saturation) that reads at
 * ≥ `min` against `bg`. Walks toward white for a dark background and toward
 * black for a light one; returns the input unchanged when it already passes.
 */
export function readableOn(hex: string, bg: string, min = 4.5): string {
  if (contrastRatio(hex, bg) >= min) return hex;
  const [h, s, l0] = hexToHsl(hex);
  const towardLight = luminance(bg) < 0.5;
  let l = l0;
  let out = hex;
  for (let i = 0; i < 100; i++) {
    l = towardLight ? Math.min(1, l + 0.01) : Math.max(0, l - 0.01);
    out = hslToHex(h, s, l);
    if (contrastRatio(out, bg) >= min) break;
    if (l === 0 || l === 1) break;
  }
  return out;
}

// The two card surfaces from index.css: --card 28 18% 9% and 40 30% 99%.
export const CARD_DARK = '#1b1713';
export const CARD_LIGHT = '#fdfcfa';

/** `fg` at `alpha` composited over opaque `bg`, as `#rrggbb`. */
export function blend(fg: string, bg: string, alpha: number): string {
  const f = parseInt(fg.slice(1, 7), 16);
  const b = parseInt(bg.slice(1, 7), 16);
  const ch = (shift: number) => {
    const v = ((f >> shift) & 255) * alpha + ((b >> shift) & 255) * (1 - alpha);
    return Math.round(v).toString(16).padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** The pill's own background: its type colour at 20% (`color + '33'`) over the card. */
export const PILL_TINT_ALPHA = 0x33 / 255;

export const TYPE_TEXT_COLORS: Record<PokemonType, { dark: string; light: string }> =
  Object.fromEntries(
    (Object.keys(TYPE_COLORS) as PokemonType[]).map(t => [
      t,
      // Measured against the pill's real background — the card with the type
      // colour tinted over it — not the bare card. The margin over 4.5 covers
      // the tinted containers pills also sit in (a threat row is the card with
      // destructive/0.1 over it, a grid card carries a type-colour gradient).
      {
        dark: readableOn(TYPE_COLORS[t], blend(TYPE_COLORS[t], CARD_DARK, PILL_TINT_ALPHA), 5.5),
        light: readableOn(TYPE_COLORS[t], blend(TYPE_COLORS[t], CARD_LIGHT, PILL_TINT_ALPHA), 5.5),
      },
    ]),
  ) as Record<PokemonType, { dark: string; light: string }>;
