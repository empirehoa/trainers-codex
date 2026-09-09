// The Trainer Legend Card — the artifact the whole feature exists to produce.
//
// One PNG carrying: verdict headline, trainer name, archetype, the final six as
// silhouettes, career stats, the 0-999 score, the seed, the playable deep-link,
// and the wordmark. Shared to Stories/TikTok/X/Discord, where it functions as
// an ad we didn't pay for.
//
// ── Why silhouettes, not sprites ─────────────────────────────────────────
// Every roster figure is rendered as a DERIVED silhouette: the sprite is drawn
// into an offscreen canvas, reduced to its alpha channel, and re-filled with a
// type-derived gradient. The source pixels never reach the output. This is what
// the spec asks for ("team silhouette", "original silhouettes/stylized canvas
// art only"), and it is the form that survives the merch review — a solid-fill
// mask is materially further from the copyrighted artwork than a reproduction
// of it, which matters a great deal more when the output is printed for sale
// than when it's on screen.
//
// ── Layout ───────────────────────────────────────────────────────────────
// Drawn once in a 1080×1350 logical space and scaled by `ctx.scale()` for
// print. Text stays vector-crisp at any factor; silhouettes are alpha masks, so
// upscaling softens edges rather than revealing sprite pixels.

import { TYPE_COLORS } from '@/lib/constants';
import { spriteUrl, POKEMON_BY_ID } from '@/lib/pokemon';
import { monEpithet, rosterCaption } from './content';
import { displayLink } from './deeplink';
import { resolveRank, rosterRarity } from './ranks';
import { mulberry32 } from './prng';
import type { JourneyRun } from './types';
import type { Locale, Vars } from '@/i18n/strings';
import { translate } from '@/i18n/strings';

const W = 1080;
const H = 1350;

/** 300 DPI print sizes, keyed to the merch catalog's poster dimensions. */
export const PRINT_SCALE = {
  /** 11×14 in poster at 300 DPI → 3300×4200. */
  poster11x14: 3300 / W,
  /** Apparel print area, 12×16 in at 300 DPI → 3600×4800. */
  apparel: 3600 / W,
} as const;

/**
 * Card finishes. `classic` is the free look; the other three are Premium
 * cosmetics (see docs/JOURNEY_MODE.md § Premium). Cosmetic is the operative
 * word: a finish changes pixels, never data — the score, verdict, QR link and
 * roster are identical on every finish, so a premium card is prettier, not
 * better, and the shared artifact stays honest.
 */
export type LegendFinish = 'classic' | 'holo-foil' | 'gold-leaf' | 'retro-crt';

export const LEGEND_FINISHES: { id: LegendFinish; premium: boolean }[] = [
  { id: 'classic', premium: false },
  { id: 'holo-foil', premium: true },
  { id: 'gold-leaf', premium: true },
  { id: 'retro-crt', premium: true },
];

export interface LegendCardOptions {
  run: JourneyRun;
  locale: Locale;
  /** Multiplier on the 1080×1350 logical canvas. 1 = share-ready. */
  scale?: number;
  /** Origin for the printed deep-link. Defaults to the live origin. */
  origin?: string;
  /** Transparent background — required for apparel prints. */
  transparent?: boolean;
  /** Card finish. Defaults to 'classic'. Premium gating happens at the UI. */
  finish?: LegendFinish;
}

// ============================================================
// CANVAS PRIMITIVES
// ============================================================

/**
 * How long to wait for one sprite before giving up on it.
 *
 * A bare image load has no timeout: `onerror` fires for a refused or 404'd
 * request, but a request that merely HANGS — captive portal, dead proxy,
 * throttled mobile connection, the sprite mirror rate-limiting — never settles
 * either way. Without this bound the whole card render awaits forever and the
 * user watches a spinner instead of getting their result. The sprites are
 * decorative input to a silhouette mask, so timing one out costs a fallback
 * shape and nothing else.
 */
export const SPRITE_TIMEOUT_MS = 4000;

export function loadImg(src: string, timeoutMs = SPRITE_TIMEOUT_MS): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Cancel the in-flight fetch so a hung request can't keep the
      // connection (or the decode) alive behind us.
      img.src = '';
      rej(new Error('img timeout: ' + src));
    }, timeoutMs);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    img.crossOrigin = 'anonymous';
    img.onload = () => finish(() => res(img));
    img.onerror = () => finish(() => rej(new Error('img failed: ' + src)));
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => {
    canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png');
  });
}

/**
 * Rounded rect with a capability guard.
 *
 * Per CLAUDE.md gotcha #9 this tests `typeof (c as {...}).roundRect` rather
 * than `'roundRect' in c` — the latter narrows the else branch to `never` and
 * TypeScript then rejects the fallback path.
 */
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof (c as { roundRect?: unknown }).roundRect === 'function') {
    c.beginPath();
    (c as CanvasRenderingContext2D & { roundRect(x: number, y: number, w: number, h: number, r: number): void })
      .roundRect(x, y, w, h, r);
    return;
  }
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * Reduce an image to a solid silhouette in `color`.
 *
 * Uses `source-in` compositing against the image's own alpha, so only the
 * shape survives — no source colour, no interior detail.
 */
export function silhouetteFrom(
  img: HTMLImageElement,
  size: number,
  color: string,
  accent: string,
): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const oc = off.getContext('2d');
  if (!oc) return off;

  oc.imageSmoothingEnabled = true;
  oc.drawImage(img, 0, 0, size, size);

  // Keep the alpha, replace everything else with a type-derived gradient.
  oc.globalCompositeOperation = 'source-in';
  const grad = oc.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, color);
  oc.fillStyle = grad;
  oc.fillRect(0, 0, size, size);
  oc.globalCompositeOperation = 'source-over';

  return off;
}

/** Placeholder used when a sprite can't be fetched (offline, rate-limited). */
export function fallbackSilhouette(size: number, color: string, accent: string): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const oc = off.getContext('2d');
  if (!oc) return off;
  const grad = oc.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, color);
  oc.fillStyle = grad;
  // A neutral capsule — reads as "a member was here" without pretending to be
  // a specific creature.
  const pad = size * 0.18;
  roundRect(oc, pad, pad, size - pad * 2, size - pad * 2, size * 0.28);
  oc.fill();
  return off;
}

export function fitText(
  c: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  font: (px: number) => string,
  minPx = 18,
): number {
  let px = startPx;
  c.font = font(px);
  while (c.measureText(text).width > maxWidth && px > minPx) {
    px -= 2;
    c.font = font(px);
  }
  return px;
}

// ============================================================
// THE CARD
// ============================================================

export async function renderLegendCard(opts: LegendCardOptions): Promise<Blob> {
  const { run, locale, scale = 1, origin, transparent = false, finish = 'classic' } = opts;
  const t = (key: string, vars?: Vars) => translate(key, locale, vars);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('canvas 2d unavailable');
  c.scale(scale, scale);

  const primary = '#f4ae3c';
  const cream = '#f5ead2';
  const dim = '#8a7e62';

  // ---------- background ----------
  if (!transparent) {
    const bg = c.createRadialGradient(W / 2, H * 0.32, 120, W / 2, H * 0.32, W * 1.1);
    bg.addColorStop(0, '#1c1812');
    bg.addColorStop(1, '#0a0806');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    // Scan lines — the house texture, shared with the CRT poster style.
    c.fillStyle = 'rgba(244,174,60,0.022)';
    for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);

    const vig = c.createRadialGradient(W / 2, H / 2, W * 0.32, W / 2, H / 2, W * 0.78);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(0,0,0,0.62)');
    c.fillStyle = vig;
    c.fillRect(0, 0, W, H);
  }

  // ---------- frame ----------
  c.strokeStyle = 'rgba(244,174,60,0.42)';
  c.lineWidth = 2;
  roundRect(c, 28, 28, W - 56, H - 56, 18);
  c.stroke();

  // Corner brackets
  c.strokeStyle = primary;
  c.lineWidth = 3;
  const bl = 42;
  for (const [cx, cy, dx, dy] of [
    [40, 40, 1, 1], [W - 40, 40, -1, 1], [40, H - 40, 1, -1], [W - 40, H - 40, -1, -1],
  ] as const) {
    c.beginPath();
    c.moveTo(cx, cy + dy * bl);
    c.lineTo(cx, cy);
    c.lineTo(cx + dx * bl, cy);
    c.stroke();
  }

  // ---------- header ----------
  c.textAlign = 'center';
  c.fillStyle = primary;
  c.font = '26px "Major Mono Display", monospace';
  c.fillText(t('journey.card.wordmark'), W / 2, 96);

  c.fillStyle = dim;
  c.font = '17px "JetBrains Mono", monospace';
  c.fillText(`// ${t('journey.title').toUpperCase()}`, W / 2, 126);

  // ---------- trainer identity ----------
  c.fillStyle = cream;
  const namePx = fitText(c, run.setup.trainerName, W - 220, 58, px => `bold ${px}px "Sora", system-ui`, 28);
  c.font = `bold ${namePx}px "Sora", system-ui`;
  c.fillText(run.setup.trainerName, W / 2, 210);

  c.fillStyle = dim;
  c.font = '19px "JetBrains Mono", monospace';
  const regionLabel = run.chapters[0]?.vars.region ?? '';
  c.fillText(
    `${t(`journey.archetype.${run.setup.archetype}`).toUpperCase()} · ${String(regionLabel).toUpperCase()} · ${t('journey.stat.age')} ${run.stats.age}`,
    W / 2, 244,
  );

  // ---------- verdict ----------
  const verdictText = t(run.verdict.titleKey, { region: String(regionLabel).toUpperCase() });
  const vPx = fitText(c, verdictText, W - 150, 74, px => `bold ${px}px "Sora", system-ui`, 30);

  // Glow behind the headline so it survives being screenshotted on a busy feed.
  c.save();
  c.shadowColor = 'rgba(244,174,60,0.55)';
  c.shadowBlur = 26;
  c.fillStyle = primary;
  c.font = `bold ${vPx}px "Sora", system-ui`;
  c.fillText(verdictText, W / 2, 336);
  c.restore();

  // Blurb, wrapped to two lines max.
  c.fillStyle = cream;
  c.font = '21px "Sora", system-ui';
  const blurb = t(run.verdict.blurbKey, { region: String(regionLabel) });
  wrapCentered(c, blurb, W / 2, 380, W - 200, 28, 2);

  // ---------- score block ----------
  const scoreY = 470;
  c.strokeStyle = 'rgba(244,174,60,0.3)';
  c.lineWidth = 1.5;
  roundRect(c, W / 2 - 190, scoreY, 380, 128, 12);
  c.stroke();

  c.fillStyle = dim;
  c.font = '15px "JetBrains Mono", monospace';
  c.fillText(t('journey.card.careerScore'), W / 2, scoreY + 32);

  c.fillStyle = primary;
  c.font = 'bold 82px "Sora", system-ui';
  c.fillText(String(run.score), W / 2 - 34, scoreY + 108);

  c.fillStyle = dim;
  c.font = '26px "JetBrains Mono", monospace';
  c.fillText('/ 999', W / 2 + 92, scoreY + 104);

  // ---------- rank + rarity ----------
  // The score answers "how well did I do" only if you already know the range.
  // A rank NAME and a percentile answer it standalone, which is what makes the
  // card legible to someone scrolling past who has never played.
  //
  // Drawn as one measured line in the 50px gap between the score box and the
  // roster. The card has no vertical slack left — the breakdown rows already
  // finish ~9px above the footer — so this deliberately does not reflow the
  // layout below it.
  const rank = resolveRank(run.score);
  const rarity = rosterRarity({
    legendaryCount: run.roster.filter(m => POKEMON_BY_ID[m.id]?.legendary || POKEMON_BY_ID[m.id]?.mythical).length,
    shinyCount: run.roster.filter(m => m.shiny).length,
    eventCount: run.roster.filter(m => m.origin === 'event').length,
    evolvedCount: run.roster.reduce((n, m) => n + (m.evolved ?? 0), 0),
    archetype: run.setup.archetype,
  });

  const rankName = t(rank.nameKey);
  const rankSub = `  ·  ${t('journey.rank.percentile', { pct: 100 - rank.percentile })}`
    + `  ·  ${t('journey.rank.rosterRarity', { pct: rarity })}`;
  const rankY = scoreY + 150;

  // Two styles on one centred line, so the rank word carries the emphasis.
  const nameFont = 'bold 24px "Sora", system-ui';
  const subFont = '16px "JetBrains Mono", monospace';
  c.textAlign = 'left';
  c.font = nameFont;
  const nameW = c.measureText(rankName).width;
  c.font = subFont;
  const subW = c.measureText(rankSub).width;
  const startX = W / 2 - (nameW + subW) / 2;

  c.font = nameFont;
  c.fillStyle = primary;
  c.fillText(rankName, startX, rankY);
  c.font = subFont;
  c.fillStyle = dim;
  c.fillText(rankSub, startX + nameW, rankY);
  c.textAlign = 'center';

  // ---------- roster silhouettes ----------
  const rosterY = 648;
  c.fillStyle = dim;
  c.font = '15px "JetBrains Mono", monospace';
  c.textAlign = 'left';
  c.fillText(`// ${t('journey.card.finalSix')}`, 66, rosterY);

  const slots = run.roster.slice(0, 6);
  const gap = 18;
  const cellW = (W - 132 - gap * 5) / 6;
  const cellH = cellW + 46;
  const silSize = Math.round(cellW * 0.82);

  const loaded = await Promise.all(slots.map(async entry => {
    const primaryType = entry.types[0] ?? 'normal';
    const color = TYPE_COLORS[primaryType] ?? '#9fa19f';
    const accent = TYPE_COLORS[entry.types[1] ?? primaryType] ?? color;
    try {
      const img = await loadImg(spriteUrl(entry.id, entry.shiny ? 'pixel-shiny' : 'pixel-default'));
      return { entry, canvas: silhouetteFrom(img, silSize, color, accent), color };
    } catch {
      // Sprites are decorative here and the mirror rate-limits occasionally
      // (CLAUDE.md debugging step 5) — the card must still render.
      return { entry, canvas: fallbackSilhouette(silSize, color, accent), color };
    }
  }));

  loaded.forEach(({ entry, canvas: sil, color }, i) => {
    const x = 66 + i * (cellW + gap);
    const y = rosterY + 22;

    c.strokeStyle = 'rgba(245,234,210,0.14)';
    c.lineWidth = 1;
    roundRect(c, x, y, cellW, cellH, 10);
    c.stroke();

    // Type wash behind the silhouette.
    c.save();
    roundRect(c, x, y, cellW, cellH, 10);
    c.clip();
    const wash = c.createLinearGradient(x, y, x, y + cellH);
    wash.addColorStop(0, `${color}22`);
    wash.addColorStop(1, 'transparent');
    c.fillStyle = wash;
    c.fillRect(x, y, cellW, cellH);
    c.restore();

    c.drawImage(sil, x + (cellW - silSize) / 2, y + 6, silSize, silSize);

    if (entry.shiny) {
      c.fillStyle = primary;
      c.font = '15px "JetBrains Mono", monospace';
      c.textAlign = 'right';
      c.fillText('★', x + cellW - 8, y + 22);
    }

    // Caption respects the flavor layer: species name, or the type pairing
    // when JOURNEY_SPECIES_FLAVOR is off.
    c.textAlign = 'center';
    c.fillStyle = cream;
    const cap = rosterCaption(entry.id);
    const capPx = fitText(c, cap, cellW - 10, 15, px => `${px}px "JetBrains Mono", monospace`, 9);
    c.font = `${capPx}px "JetBrains Mono", monospace`;
    c.fillText(cap, x + cellW / 2, y + silSize + 22);

    c.fillStyle = dim;
    c.font = '10px "JetBrains Mono", monospace';
    c.fillText(monEpithet(entry.id), x + cellW / 2, y + silSize + 38);
  });

  // ---------- stats grid ----------
  const statsY = rosterY + cellH + 76;
  const battles = run.stats.wins + run.stats.losses;
  const winPct = battles > 0 ? Math.round((run.stats.wins / battles) * 100) : 0;

  const cells: [string, string][] = [
    [t('journey.stat.badges'), String(run.stats.badges)],
    [t('journey.stat.winRate'), `${winPct}%`],
    [t('journey.stat.titles'), String(run.stats.titles)],
    [t('journey.stat.catches'), String(run.stats.catches)],
    [t('journey.stat.shinies'), String(run.stats.shinies)],
    [t('journey.stat.peakRank'), run.stats.peakRank >= 999 ? '—' : `#${run.stats.peakRank}`],
  ];

  const scols = 3;
  const scw = (W - 132 - 20 * (scols - 1)) / scols;
  const sch = 76;
  cells.forEach(([label, value], i) => {
    const col = i % scols;
    const row = Math.floor(i / scols);
    const x = 66 + col * (scw + 20);
    const y = statsY + row * (sch + 14);

    c.strokeStyle = 'rgba(245,234,210,0.12)';
    c.lineWidth = 1;
    roundRect(c, x, y, scw, sch, 8);
    c.stroke();

    c.textAlign = 'left';
    c.fillStyle = dim;
    c.font = '13px "JetBrains Mono", monospace';
    c.fillText(label.toUpperCase(), x + 14, y + 26);

    c.fillStyle = cream;
    c.font = 'bold 32px "Sora", system-ui';
    c.fillText(value, x + 14, y + 62);
  });

  // ---------- what drove the score ----------
  // Fills the band between the stats grid and the footer, and answers the
  // question the score itself provokes ("why 666?") without a second screen.
  const breakdownY = statsY + (sch + 14) * 2 + 24;
  const top = run.breakdown.components.filter(x => x.value > 0).slice(0, 3);
  if (top.length > 0) {
    c.textAlign = 'left';
    c.fillStyle = dim;
    c.font = '15px "JetBrains Mono", monospace';
    c.fillText(`// ${t('journey.result.breakdown')}`, 66, breakdownY);

    const barMax = top[0].value;
    const barW = W - 132 - 190;
    top.forEach((comp, i) => {
      const y = breakdownY + 26 + i * 30;
      c.fillStyle = cream;
      c.font = '15px "JetBrains Mono", monospace';
      c.fillText(t(comp.label), 66, y + 12);

      const bx = 66 + 150;
      c.fillStyle = 'rgba(245,234,210,0.10)';
      roundRect(c, bx, y + 2, barW, 11, 5.5);
      c.fill();

      c.fillStyle = primary;
      roundRect(c, bx, y + 2, Math.max(6, (comp.value / barMax) * barW), 11, 5.5);
      c.fill();

      c.fillStyle = dim;
      c.font = '14px "JetBrains Mono", monospace';
      c.textAlign = 'right';
      c.fillText(String(comp.value), W - 66, y + 12);
      c.textAlign = 'left';
    });
  }

  // ---------- footer: seed + playable link ----------
  const footY = H - 96;
  c.textAlign = 'center';
  c.fillStyle = primary;
  c.font = '19px "JetBrains Mono", monospace';
  c.fillText(`${t('journey.card.seed')} ${run.setup.seed}`, W / 2, footY);

  c.fillStyle = cream;
  c.font = '20px "JetBrains Mono", monospace';
  c.fillText(displayLink(run.setup.seed, origin), W / 2, footY + 30);

  c.fillStyle = dim;
  c.font = '11px "JetBrains Mono", monospace';
  c.fillText(t('journey.card.disclaimer'), W / 2, footY + 56);

  // ---------- finish overlay (premium cosmetics) ----------
  applyFinish(c, finish, run.setup.seed);

  return toBlob(canvas);
}

function wrapCentered(
  c: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (c.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = probe;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  // Ellipsise if the blurb didn't fit — better than silently dropping a clause.
  if (lines.length === maxLines) {
    const consumed = lines.join(' ').split(/\s+/).length;
    if (consumed < words.length) {
      let last = lines[maxLines - 1];
      while (c.measureText(`${last}…`).width > maxWidth && last.includes(' ')) {
        last = last.slice(0, last.lastIndexOf(' '));
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }

  lines.forEach((l, i) => c.fillText(l, cx, y + i * lineHeight));
}

/**
 * Apply a finish overlay on the completed card.
 *
 * Deterministic on the run's seed (sparkle positions come from mulberry32,
 * never Math.random) so the same career renders the same card byte-for-byte —
 * the replay contract extends to the artwork.
 */
function applyFinish(c: CanvasRenderingContext2D, finish: LegendFinish, seed: number): void {
  if (finish === 'classic') return;

  if (finish === 'holo-foil') {
    // Diagonal spectral sweep, the TCG holo look. Screen blend keeps the
    // underlying ink legible; two passes give the band a hot core.
    c.save();
    c.globalCompositeOperation = 'screen';
    const sweep = c.createLinearGradient(0, H, W, 0);
    const stops: [number, string][] = [
      [0.00, 'rgba(255,64,128,0)'], [0.18, 'rgba(255,64,128,0.16)'],
      [0.34, 'rgba(64,160,255,0.18)'], [0.50, 'rgba(64,255,196,0.20)'],
      [0.66, 'rgba(255,224,64,0.18)'], [0.82, 'rgba(196,64,255,0.16)'],
      [1.00, 'rgba(196,64,255,0)'],
    ];
    for (const [at, color] of stops) sweep.addColorStop(at, color);
    c.fillStyle = sweep;
    c.fillRect(0, 0, W, H);

    // Seeded sparkle field.
    const rng = mulberry32(seed ^ 0x51ab);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 90; i++) {
      const x = rng() * W;
      const y = rng() * H;
      const r = 0.6 + rng() * 1.8;
      c.fillStyle = `rgba(255,255,255,${0.10 + rng() * 0.22})`;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    return;
  }

  if (finish === 'gold-leaf') {
    c.save();
    // Warm wash + a heavy gilded frame inside the standard one.
    c.globalCompositeOperation = 'overlay';
    c.fillStyle = 'rgba(244,174,60,0.10)';
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
    const gold = c.createLinearGradient(0, 0, W, H);
    gold.addColorStop(0, 'rgba(255,214,120,0.95)');
    gold.addColorStop(0.5, 'rgba(214,164,60,0.95)');
    gold.addColorStop(1, 'rgba(255,232,160,0.95)');
    c.strokeStyle = gold;
    c.lineWidth = 6;
    roundRect(c, 40, 40, W - 80, H - 80, 14);
    c.stroke();
    c.lineWidth = 1.5;
    roundRect(c, 52, 52, W - 104, H - 104, 10);
    c.stroke();
    // Corner leaf dots — seeded jitter so each career's leaf lies differently.
    const rng = mulberry32(seed ^ 0x60fd);
    for (const [cx, cy] of [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]] as const) {
      for (let i = 0; i < 7; i++) {
        c.fillStyle = `rgba(255,220,140,${0.35 + rng() * 0.4})`;
        c.beginPath();
        c.arc(cx + (rng() - 0.5) * 34, cy + (rng() - 0.5) * 34, 1 + rng() * 2.2, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
    return;
  }

  // retro-crt: heavier scanlines, phosphor tint, edge bloom.
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 2);
  c.globalCompositeOperation = 'overlay';
  c.fillStyle = 'rgba(80,255,160,0.10)';
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'screen';
  const glow = c.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.75);
  glow.addColorStop(0, 'rgba(120,255,190,0.05)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, W, H);
  c.restore();
}

/**
 * Print-ready render for the merch pipeline. Gated by JOURNEY_MERCH_CTA at the
 * call site — see docs/JOURNEY_MODE.md for the unblock conditions (R2/Printful
 * verification AND counsel sign-off on silhouette merch).
 */
export async function renderLegendCardPrint(
  opts: Omit<LegendCardOptions, 'scale' | 'transparent'> & { target: keyof typeof PRINT_SCALE },
): Promise<Blob> {
  return renderLegendCard({
    ...opts,
    scale: PRINT_SCALE[opts.target],
    transparent: opts.target === 'apparel',
  });
}
