// Print-ready merchandise design renderers.
// Outputs high-resolution PNGs (300 DPI at the product's print dimensions)
// with TRANSPARENT BACKGROUNDS for apparel/totes/cases — POD vendors print these
// directly onto the garment.
//
// Mug + mousepad + poster designs are produced full-bleed (with backgrounds).

import type { Pokemon, TeamMember, TrainerProfile } from './types';
import { TYPE_COLORS } from './constants';
import { spriteUrl, padId, POKEMON_BY_ID } from './pokemon';
import type { MerchProduct } from './merch';

export type MerchDesign =
  | 'crest'           // Circular team crest with central trainer mark
  | 'roster'          // Horizontal champion-roster strip
  | 'id-card'         // Trainer ID badge layout
  | 'banner'          // Vertical pennant banner
  | 'lineup'          // 6 mons in a line with stats below
  | 'sigil'           // Single hero Pokémon in heraldic shield form
  | 'trainer-card';   // v6 — full trainer card with 8 gym badges + 6-mon team + signature

export interface MerchRenderContext {
  team: (TeamMember | null)[];
  trainer: TrainerProfile | null;
  teamName: string;
  code: string;
  product: MerchProduct;
  design: MerchDesign;
  // Trainer customization fields
  gymName?: string;     // e.g. "Empire City Gym"
  region?: string;      // e.g. "FLORIDA"
  badgeText?: string;   // e.g. "GYM LEADER"
  year?: number;        // e.g. 2026
  // v6 — trainer-card specific
  badges?: string[];    // ids of claimed gym badges (see GYM_BADGES below)
  signatureMonId?: number;  // hero mon highlighted at top of card
  // Apparel-only: transparent bg true; full-bleed products (mug/poster/mousepad) false
  transparentBg?: boolean;
}

// ============================================================
// GYM BADGES — Kanto's 8 (v1). Later expand per region.
// ============================================================
//
// Each badge is rendered as a vector shape (no external image dependency,
// always available, scales to any print resolution). The color = the gym
// type. The shape echoes the canonical badge silhouette.

export interface GymBadgeInfo {
  id: string;
  label: string;     // gym leader name + city
  type: string;      // the badge's affiliated Pokémon type
  shape: 'octagon' | 'cascade' | 'thunder' | 'rainbow' | 'soul' | 'marsh' | 'volcano' | 'earth';
  // Primary color from the gym type
  color: string;
}

export const GYM_BADGES: GymBadgeInfo[] = [
  { id: 'kanto-boulder',  label: 'Brock · Pewter City',    type: 'rock',     shape: 'octagon', color: '#afa981' },
  { id: 'kanto-cascade',  label: 'Misty · Cerulean City',  type: 'water',    shape: 'cascade', color: '#2980ef' },
  { id: 'kanto-thunder',  label: 'Surge · Vermillion City', type: 'electric', shape: 'thunder', color: '#fac000' },
  { id: 'kanto-rainbow',  label: 'Erika · Celadon City',   type: 'grass',    shape: 'rainbow', color: '#3fa129' },
  { id: 'kanto-soul',     label: 'Koga · Fuchsia City',    type: 'poison',   shape: 'soul',    color: '#9141cb' },
  { id: 'kanto-marsh',    label: 'Sabrina · Saffron City', type: 'psychic',  shape: 'marsh',   color: '#ef4179' },
  { id: 'kanto-volcano',  label: 'Blaine · Cinnabar Island', type: 'fire',   shape: 'volcano', color: '#e62829' },
  { id: 'kanto-earth',    label: 'Giovanni · Viridian City', type: 'ground', shape: 'earth',   color: '#915121' },
];

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('img failed: ' + src));
    img.src = src;
  });
}

async function loadTeam(team: (TeamMember | null)[]): Promise<Array<{ pokemon: Pokemon; member: TeamMember; img: HTMLImageElement }>> {
  const filled = team.filter((m): m is TeamMember => m !== null);
  const results = await Promise.all(filled.map(async m => {
    const pokemon = POKEMON_BY_ID[m.id];
    if (!pokemon) return null;
    try {
      const variant = m.shiny ? 'artwork-shiny' : 'artwork-default';
      const img = await loadImg(spriteUrl(m.id, variant));
      return { pokemon, member: m, img };
    } catch {
      try {
        const img = await loadImg(spriteUrl(m.id, 'pixel-default'));
        return { pokemon, member: m, img };
      } catch { return null; }
    }
  }));
  return results.filter((x): x is { pokemon: Pokemon; member: TeamMember; img: HTMLImageElement } => x !== null);
}

function setupCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  return { canvas, ctx };
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => {
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png');
  });
}

/**
 * Compute the centered design region inside the print area, leaving a safe
 * gutter so the design isn't placed too close to the seam.
 */
function computeDesignRegion(w: number, h: number, isApparel: boolean) {
  if (isApparel) {
    // For T-shirts/hoodies, the design is centered roughly in the upper half of the print area.
    // Print area is 12×16 in; design fits comfortably within 10×12 in (3000×3600 px) centered.
    const dw = w * 0.83;
    const dh = h * 0.75;
    const x = (w - dw) / 2;
    const y = h * 0.10;
    return { x, y, w: dw, h: dh };
  }
  // Full-bleed: use whole area
  return { x: 0, y: 0, w, h };
}

// ============================================================
// DESIGN 1 — TEAM CREST (circular badge)
// Best for: shirts (center-chest), hoodies, mugs, stickers, hats
// ============================================================
async function renderCrest(c: CanvasRenderingContext2D, region: { x: number; y: number; w: number; h: number }, ctx: MerchRenderContext) {
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  const radius = Math.min(region.w, region.h) * 0.46;

  // Outer ring (gold metallic look approximated with gradient)
  const ringGrad = c.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  ringGrad.addColorStop(0, '#6e5224');
  ringGrad.addColorStop(0.3, '#fde047');
  ringGrad.addColorStop(0.5, '#fff8dc');
  ringGrad.addColorStop(0.7, '#fde047');
  ringGrad.addColorStop(1, '#6e5224');
  c.strokeStyle = ringGrad;
  c.lineWidth = radius * 0.045;
  c.beginPath();
  c.arc(cx, cy, radius, 0, Math.PI * 2);
  c.stroke();

  // Inner ring (thinner)
  c.lineWidth = radius * 0.015;
  c.strokeStyle = '#fde047';
  c.beginPath();
  c.arc(cx, cy, radius * 0.94, 0, Math.PI * 2);
  c.stroke();

  // Dark inner circle for contrast
  c.fillStyle = '#0c0a08';
  c.beginPath();
  c.arc(cx, cy, radius * 0.93, 0, Math.PI * 2);
  c.fill();

  // Sub-ring of sprites — 6 positions around the center
  const imgs = await loadTeam(ctx.team);
  const subRadius = radius * 0.66;
  const spriteSize = radius * 0.36;
  imgs.forEach((entry, i) => {
    const angle = (Math.PI * 2 / 6) * i - Math.PI / 2;
    const sx = cx + Math.cos(angle) * subRadius;
    const sy = cy + Math.sin(angle) * subRadius;

    // Type-color halo behind sprite
    const primary = TYPE_COLORS[entry.pokemon.types[0]];
    const halo = c.createRadialGradient(sx, sy, 0, sx, sy, spriteSize * 0.85);
    halo.addColorStop(0, primary + 'ff');
    halo.addColorStop(0.6, primary + '66');
    halo.addColorStop(1, primary + '00');
    c.fillStyle = halo;
    c.beginPath();
    c.arc(sx, sy, spriteSize * 0.85, 0, Math.PI * 2);
    c.fill();

    // Sprite
    c.imageSmoothingEnabled = true;
    c.drawImage(entry.img, sx - spriteSize / 2, sy - spriteSize / 2, spriteSize, spriteSize);
  });

  // Central monogram/badge text — trainer initials or "TC"
  const initials = (ctx.trainer?.name ?? 'TC')
    .split(/\s+/)
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'TC';

  // Central rosette
  const centerR = radius * 0.32;
  const centerGrad = c.createRadialGradient(cx, cy, 0, cx, cy, centerR);
  centerGrad.addColorStop(0, '#fde047');
  centerGrad.addColorStop(0.7, '#f4ae3c');
  centerGrad.addColorStop(1, '#6e5224');
  c.fillStyle = centerGrad;
  c.beginPath();
  c.arc(cx, cy, centerR, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#0c0a08';
  c.lineWidth = radius * 0.012;
  c.beginPath();
  c.arc(cx, cy, centerR, 0, Math.PI * 2);
  c.stroke();

  c.fillStyle = '#0c0a08';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `bold ${radius * 0.34}px "Major Mono Display", monospace`;
  c.fillText(initials, cx, cy);

  // Arched top text (gym name / banner text)
  if (ctx.gymName || ctx.badgeText) {
    drawArchedText(c, ctx.gymName || ctx.badgeText || '', cx, cy, radius * 0.83, -Math.PI * 0.55, Math.PI * 0.55, radius * 0.10, '#fde047');
  }

  // Bottom arched text (region / year)
  if (ctx.region || ctx.year) {
    const bottom = [ctx.region, ctx.year ? `EST. ${ctx.year}` : null].filter(Boolean).join(' · ');
    drawArchedText(c, bottom, cx, cy, radius * 0.83, Math.PI * 0.55, Math.PI * 1.45, radius * 0.08, '#fde047', true);
  }

  // Reset baseline
  c.textBaseline = 'alphabetic';
}

/** Draw text along an arc — used for badge top/bottom curves. */
function drawArchedText(
  c: CanvasRenderingContext2D, text: string, cx: number, cy: number, radius: number,
  startAngle: number, endAngle: number, fontSize: number, color: string, flip = false
) {
  if (!text) return;
  c.save();
  c.fillStyle = color;
  c.font = `bold ${fontSize}px "JetBrains Mono", monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const span = endAngle - startAngle;
  const chars = text.toUpperCase().split('');
  const angleStep = span / Math.max(1, chars.length);
  chars.forEach((ch, i) => {
    const angle = startAngle + angleStep * (i + 0.5);
    const r = flip ? radius : radius;
    const tx = cx + Math.cos(angle) * r;
    const ty = cy + Math.sin(angle) * r;
    c.save();
    c.translate(tx, ty);
    c.rotate(flip ? angle - Math.PI / 2 : angle + Math.PI / 2);
    c.fillText(ch, 0, 0);
    c.restore();
  });
  c.restore();
}

// ============================================================
// DESIGN 2 — CHAMPION ROSTER (horizontal strip)
// Best for: tees back-print, mugs, mousepad, posters
// ============================================================
async function renderRoster(c: CanvasRenderingContext2D, region: { x: number; y: number; w: number; h: number }, ctx: MerchRenderContext) {
  const imgs = await loadTeam(ctx.team);

  // Top: trainer name banner with serif type
  c.fillStyle = '#0c0a08';
  c.textAlign = 'center';
  c.font = `bold ${region.w * 0.055}px "Sora", system-ui`;
  const headline = (ctx.gymName || ctx.trainer?.name || 'TEAM').toUpperCase();
  c.fillText(headline, region.x + region.w / 2, region.y + region.h * 0.10);

  if (ctx.badgeText || ctx.region) {
    c.font = `${region.w * 0.022}px "JetBrains Mono", monospace`;
    c.fillStyle = '#0c0a08aa';
    c.fillText(
      [ctx.badgeText, ctx.region, ctx.year].filter(Boolean).join('  ·  '),
      region.x + region.w / 2, region.y + region.h * 0.155
    );
  }

  // Horizontal sprite line
  const lineY = region.y + region.h * 0.50;
  const spriteSize = Math.min(region.w / 7, region.h * 0.55);
  const totalWidth = spriteSize * imgs.length + spriteSize * 0.2 * (imgs.length - 1);
  let startX = region.x + (region.w - totalWidth) / 2;

  imgs.forEach((entry, i) => {
    const sx = startX + i * (spriteSize * 1.2) + spriteSize / 2;
    const primary = TYPE_COLORS[entry.pokemon.types[0]];

    // Inverse-bordered pill behind sprite
    c.fillStyle = primary;
    c.beginPath();
    const hasRoundRect = typeof (c as { roundRect?: unknown }).roundRect === 'function';
    if (hasRoundRect) {
      (c as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void })
        .roundRect(sx - spriteSize / 2, lineY - spriteSize / 2, spriteSize, spriteSize, spriteSize * 0.12);
    } else {
      c.rect(sx - spriteSize / 2, lineY - spriteSize / 2, spriteSize, spriteSize);
    }
    c.fill();

    c.imageSmoothingEnabled = true;
    c.drawImage(entry.img, sx - spriteSize * 0.45, lineY - spriteSize * 0.45, spriteSize * 0.9, spriteSize * 0.9);
  });

  // Names underneath
  c.fillStyle = '#0c0a08';
  c.font = `bold ${region.w * 0.022}px "JetBrains Mono", monospace`;
  c.textAlign = 'center';
  imgs.forEach((entry, i) => {
    const sx = startX + i * (spriteSize * 1.2) + spriteSize / 2;
    const name = (entry.member.nickname || entry.pokemon.display).toUpperCase();
    const short = name.length > 12 ? name.slice(0, 11) + '…' : name;
    c.fillText(short, sx, lineY + spriteSize / 2 + region.w * 0.030);
  });

  // Foot: dex codes
  c.font = `${region.w * 0.016}px "JetBrains Mono", monospace`;
  c.fillStyle = '#0c0a08aa';
  c.textAlign = 'center';
  c.fillText(`// ROSTER CODE  ${ctx.code}`, region.x + region.w / 2, region.y + region.h * 0.92);
}

// ============================================================
// DESIGN 3 — TRAINER ID CARD (badge layout)
// Best for: shirts back, posters, stickers, phone cases
// ============================================================
async function renderIdCard(c: CanvasRenderingContext2D, region: { x: number; y: number; w: number; h: number }, ctx: MerchRenderContext) {
  // Card backing
  c.fillStyle = '#f5ead2';
  c.fillRect(region.x, region.y, region.w, region.h);

  // Outer border
  c.strokeStyle = '#0c0a08';
  c.lineWidth = region.w * 0.008;
  c.strokeRect(region.x + region.w * 0.025, region.y + region.h * 0.025, region.w * 0.95, region.h * 0.95);

  // Top color band
  const primary = ctx.trainer?.favoriteType ? TYPE_COLORS[ctx.trainer.favoriteType] : '#f4ae3c';
  c.fillStyle = primary;
  c.fillRect(region.x + region.w * 0.04, region.y + region.h * 0.04, region.w * 0.92, region.h * 0.11);

  c.fillStyle = '#fff';
  c.textAlign = 'left';
  c.font = `bold ${region.w * 0.045}px "Major Mono Display", monospace`;
  c.fillText('TRAINER ID', region.x + region.w * 0.07, region.y + region.h * 0.115);
  c.textAlign = 'right';
  c.font = `${region.w * 0.025}px "JetBrains Mono", monospace`;
  c.fillText(`#${ctx.code.split('-')[0] || '000000'}`, region.x + region.w * 0.93, region.y + region.h * 0.115);

  // Avatar slot (top-left of card body)
  const avatarX = region.x + region.w * 0.07;
  const avatarY = region.y + region.h * 0.20;
  const avatarSize = region.w * 0.30;
  c.strokeStyle = '#0c0a08';
  c.lineWidth = region.w * 0.005;
  c.strokeRect(avatarX, avatarY, avatarSize, avatarSize);
  c.fillStyle = '#0c0a08';
  c.font = `${region.w * 0.018}px "JetBrains Mono", monospace`;
  c.textAlign = 'center';
  c.fillText('// AVATAR', avatarX + avatarSize / 2, avatarY + avatarSize / 2);

  // Try to load avatar Pokémon sprite if defined
  if (ctx.trainer?.avatarId) {
    const av = ctx.trainer.avatarId;
    const avId = parseInt(av, 10);
    if (!Number.isNaN(avId)) {
      try {
        const img = await loadImg(spriteUrl(avId, 'artwork-default'));
        c.imageSmoothingEnabled = true;
        c.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
      } catch { /* leave placeholder */ }
    } else {
      // Look up well-known names
      const knownAvatars: Record<string, number> = {
        pikachu: 25, eevee: 133, charmander: 4, bulbasaur: 1, squirtle: 7,
        mimikyu: 778, gengar: 94, snorlax: 143, lucario: 448, umbreon: 197,
        sylveon: 700, sprigatito: 906,
      };
      const id = knownAvatars[av];
      if (id) {
        try {
          const img = await loadImg(spriteUrl(id, 'artwork-default'));
          c.imageSmoothingEnabled = true;
          c.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
        } catch { /* skip */ }
      }
    }
  }

  // Right of avatar: trainer info
  const infoX = avatarX + avatarSize + region.w * 0.04;
  const lh = region.w * 0.035;
  c.fillStyle = '#0c0a08';
  c.textAlign = 'left';

  c.font = `${region.w * 0.020}px "JetBrains Mono", monospace`;
  c.fillStyle = '#7a6f55';
  c.fillText('// NAME', infoX, avatarY + lh * 0.5);
  c.fillStyle = '#0c0a08';
  c.font = `bold ${region.w * 0.040}px "Sora", system-ui`;
  c.fillText((ctx.trainer?.name || 'ANONYMOUS').toUpperCase(), infoX, avatarY + lh * 1.4);

  c.font = `${region.w * 0.020}px "JetBrains Mono", monospace`;
  c.fillStyle = '#7a6f55';
  c.fillText('// TITLE', infoX, avatarY + lh * 2.4);
  c.fillStyle = '#0c0a08';
  c.font = `bold ${region.w * 0.028}px "JetBrains Mono", monospace`;
  c.fillText((ctx.badgeText || ctx.trainer?.title || 'TRAINER').toUpperCase(), infoX, avatarY + lh * 3.1);

  c.font = `${region.w * 0.020}px "JetBrains Mono", monospace`;
  c.fillStyle = '#7a6f55';
  c.fillText('// REGION', infoX, avatarY + lh * 4.1);
  c.fillStyle = '#0c0a08';
  c.font = `bold ${region.w * 0.028}px "JetBrains Mono", monospace`;
  c.fillText((ctx.region || ctx.trainer?.region || '—').toUpperCase(), infoX, avatarY + lh * 4.8);

  // Team strip (bottom of card)
  const teamY = region.y + region.h * 0.58;
  const teamX = region.x + region.w * 0.07;
  const teamW = region.w * 0.86;

  c.font = `bold ${region.w * 0.020}px "JetBrains Mono", monospace`;
  c.fillStyle = '#7a6f55';
  c.textAlign = 'left';
  c.fillText('// ACTIVE PARTY', teamX, teamY);

  const imgs = await loadTeam(ctx.team);
  const slotSize = teamW / 6.4;
  imgs.forEach((entry, i) => {
    const sx = teamX + i * (slotSize * 1.05);
    const sy = teamY + region.h * 0.025;
    const primary2 = TYPE_COLORS[entry.pokemon.types[0]];

    c.fillStyle = primary2 + '40';
    c.fillRect(sx, sy, slotSize, slotSize);
    c.strokeStyle = primary2;
    c.lineWidth = region.w * 0.004;
    c.strokeRect(sx, sy, slotSize, slotSize);

    c.imageSmoothingEnabled = true;
    c.drawImage(entry.img, sx + slotSize * 0.05, sy + slotSize * 0.05, slotSize * 0.90, slotSize * 0.90);

    // Dex number
    c.fillStyle = '#0c0a08';
    c.font = `${region.w * 0.014}px "JetBrains Mono", monospace`;
    c.textAlign = 'left';
    c.fillText(padId(entry.pokemon.id), sx + 4, sy + slotSize - 6);

    // Tera type indicator
    if (entry.member.teraType) {
      const teraColor = TYPE_COLORS[entry.member.teraType];
      c.fillStyle = teraColor;
      c.beginPath();
      c.arc(sx + slotSize - 8, sy + 8, 6, 0, Math.PI * 2);
      c.fill();
    }
  });

  // Barcode bar (decorative)
  const barX = region.x + region.w * 0.07;
  const barY = region.y + region.h * 0.88;
  const barW = region.w * 0.86;
  const barH = region.h * 0.04;
  let x = barX;
  c.fillStyle = '#0c0a08';
  while (x < barX + barW) {
    const w = 1 + Math.floor(Math.random() * 4);
    c.fillRect(x, barY, w, barH);
    x += w + (1 + Math.floor(Math.random() * 3));
  }
  c.font = `${region.w * 0.014}px "JetBrains Mono", monospace`;
  c.textAlign = 'right';
  c.fillText(ctx.code, region.x + region.w * 0.93, barY + barH + region.h * 0.02);
}

// ============================================================
// DESIGN 4 — VERTICAL BANNER (gym pennant)
// Best for: posters 11×14 / 18×24, vertical phone cases
// ============================================================
async function renderBanner(c: CanvasRenderingContext2D, region: { x: number; y: number; w: number; h: number }, ctx: MerchRenderContext) {
  const primary = ctx.trainer?.favoriteType ? TYPE_COLORS[ctx.trainer.favoriteType] : '#f4ae3c';

  // Pennant background
  const bgGrad = c.createLinearGradient(region.x, region.y, region.x, region.y + region.h);
  bgGrad.addColorStop(0, primary);
  bgGrad.addColorStop(1, '#0c0a08');
  c.fillStyle = bgGrad;
  c.fillRect(region.x, region.y, region.w, region.h);

  // Cream center stripe
  const stripeX = region.x + region.w * 0.10;
  const stripeW = region.w * 0.80;
  c.fillStyle = '#f5ead2';
  c.fillRect(stripeX, region.y + region.h * 0.06, stripeW, region.h * 0.88);

  // Top headline
  c.fillStyle = '#0c0a08';
  c.textAlign = 'center';
  c.font = `bold ${region.w * 0.10}px "Major Mono Display", monospace`;
  const headline = (ctx.gymName || ctx.trainer?.name || 'CHAMPION').toUpperCase();
  c.fillText(headline.length > 14 ? headline.slice(0, 14) : headline, region.x + region.w / 2, region.y + region.h * 0.15);

  // Subhead
  c.font = `${region.w * 0.035}px "JetBrains Mono", monospace`;
  c.fillStyle = primary;
  c.fillText(
    [ctx.badgeText, ctx.region].filter(Boolean).join('  ·  ').toUpperCase() || 'TEAM ROSTER',
    region.x + region.w / 2, region.y + region.h * 0.20
  );

  // Six sprite blocks stacked
  const imgs = await loadTeam(ctx.team);
  const blockY = region.y + region.h * 0.26;
  const blockH = region.h * 0.10;
  const blockW = stripeW * 0.86;
  const blockX = region.x + region.w / 2 - blockW / 2;

  imgs.forEach((entry, i) => {
    const y = blockY + i * (blockH + region.h * 0.012);
    const primary2 = TYPE_COLORS[entry.pokemon.types[0]];

    // Block backing
    c.fillStyle = primary2 + 'd0';
    c.fillRect(blockX, y, blockW, blockH);

    // Sprite (left)
    c.imageSmoothingEnabled = true;
    c.drawImage(entry.img, blockX + blockH * 0.05, y + blockH * 0.05, blockH * 0.9, blockH * 0.9);

    // Text (right)
    c.fillStyle = '#fff';
    c.textAlign = 'left';
    const tx = blockX + blockH + region.w * 0.02;
    c.font = `bold ${blockH * 0.35}px "Sora", system-ui`;
    const name = (entry.member.nickname || entry.pokemon.display).toUpperCase();
    c.fillText(name.length > 18 ? name.slice(0, 17) + '…' : name, tx, y + blockH * 0.45);
    c.font = `${blockH * 0.20}px "JetBrains Mono", monospace`;
    c.fillText(entry.pokemon.types.join(' · ').toUpperCase() + `   BST ${entry.pokemon.bst}`, tx, y + blockH * 0.75);

    // Dex on far right
    c.textAlign = 'right';
    c.font = `${blockH * 0.22}px "JetBrains Mono", monospace`;
    c.fillStyle = '#fff';
    c.fillText(padId(entry.pokemon.id), blockX + blockW - blockH * 0.15, y + blockH * 0.60);
  });

  // Bottom: code + year
  c.fillStyle = '#0c0a08';
  c.textAlign = 'center';
  c.font = `bold ${region.w * 0.035}px "JetBrains Mono", monospace`;
  c.fillText(`EST. ${ctx.year || new Date().getFullYear()}`, region.x + region.w / 2, region.y + region.h * 0.96);
}

// ============================================================
// DESIGN 7 (v6) — TRAINER CARD
// ============================================================
// Layout (3:4 aspect, top-to-bottom):
//   header band      — trainer name + region/title + year
//   signature mon    — large hero artwork on the left, stats on the right
//   gym badge row    — 8 slots, claimed badges colored, unclaimed dimmed
//   6-mon team strip — sprites + nicknames + tera gems
//   footer band      — motto or share code

async function renderTrainerCard(c: CanvasRenderingContext2D, region: { x: number; y: number; w: number; h: number }, ctx: MerchRenderContext): Promise<void> {
  const entries = await loadTeam(ctx.team);
  const { x: rx, y: ry, w: rw, h: rh } = region;

  // Background card
  c.fillStyle = '#fffbf0';
  c.fillRect(rx, ry, rw, rh);

  // Top header band — trainer name + region + year
  const headerH = rh * 0.10;
  c.fillStyle = '#1b1a17';
  c.fillRect(rx, ry, rw, headerH);
  c.fillStyle = '#f4ae3c';
  c.fillRect(rx, ry + headerH - rh * 0.005, rw, rh * 0.005); // gold accent line

  c.fillStyle = '#fffbf0';
  c.textAlign = 'left';
  c.font = `bold ${headerH * 0.45}px "Major Mono Display", monospace`;
  const trainerName = (ctx.trainer?.name || 'Trainer').toUpperCase();
  c.fillText(trainerName, rx + rw * 0.04, ry + headerH * 0.62);

  c.font = `${headerH * 0.22}px "JetBrains Mono", monospace`;
  c.fillStyle = '#f4ae3c';
  const subtitle = [
    ctx.trainer?.title?.toUpperCase(),
    ctx.region?.toUpperCase() || ctx.trainer?.region?.toUpperCase(),
    ctx.year || ctx.trainer?.signaturePokemonId ? String(ctx.year || new Date().getFullYear()) : null,
  ].filter(Boolean).join(' · ');
  c.fillText(subtitle, rx + rw * 0.04, ry + headerH * 0.88);

  // Trainer card stamp (top right)
  c.fillStyle = '#fffbf0';
  c.textAlign = 'right';
  c.font = `${headerH * 0.20}px "JetBrains Mono", monospace`;
  c.fillText("// TRAINER'S CODEX", rx + rw - rw * 0.04, ry + headerH * 0.38);
  c.font = `bold ${headerH * 0.34}px "Major Mono Display", monospace`;
  c.fillStyle = '#f4ae3c';
  c.fillText('OFFICIAL', rx + rw - rw * 0.04, ry + headerH * 0.78);

  // Signature mon band
  const sigY = ry + headerH + rh * 0.02;
  const sigH = rh * 0.30;
  const sigMonId = ctx.signatureMonId ?? ctx.trainer?.signaturePokemonId ?? entries[0]?.pokemon.id;
  if (sigMonId && POKEMON_BY_ID[sigMonId]) {
    const sigMon = POKEMON_BY_ID[sigMonId];
    const sigPrimary = TYPE_COLORS[sigMon.types[0]] || '#f4ae3c';

    // Soft type-colored backdrop
    c.fillStyle = sigPrimary + '20';
    c.fillRect(rx + rw * 0.04, sigY, rw * 0.92, sigH);

    // Try to load + draw the signature artwork
    try {
      const sigImg = await loadImg(spriteUrl(sigMon.id, 'artwork-default'));
      const imgSize = sigH * 0.92;
      c.drawImage(sigImg, rx + rw * 0.06, sigY + (sigH - imgSize) / 2, imgSize, imgSize);
    } catch {}

    // Signature info (right side)
    const infoX = rx + rw * 0.06 + sigH * 1.0;
    c.fillStyle = '#1b1a17';
    c.textAlign = 'left';
    c.font = `bold ${sigH * 0.16}px "Sora", system-ui`;
    c.fillText('SIGNATURE', infoX, sigY + sigH * 0.22);

    c.font = `bold ${sigH * 0.30}px "Major Mono Display", monospace`;
    c.fillStyle = sigPrimary;
    c.fillText(sigMon.display.toUpperCase(), infoX, sigY + sigH * 0.50);

    c.fillStyle = '#3a342a';
    c.font = `${sigH * 0.13}px "JetBrains Mono", monospace`;
    c.fillText(`${sigMon.types.join(' · ').toUpperCase()}   BST ${sigMon.bst}`, infoX, sigY + sigH * 0.68);
    c.fillText(padId(sigMon.id), infoX, sigY + sigH * 0.84);
  }

  // Gym badges row — 8 slots
  const badgeY = sigY + sigH + rh * 0.03;
  const badgeH = rh * 0.14;
  const claimedSet = new Set(ctx.badges ?? []);
  c.fillStyle = '#1b1a17';
  c.textAlign = 'left';
  c.font = `bold ${rh * 0.022}px "JetBrains Mono", monospace`;
  c.fillText('// GYM BADGES', rx + rw * 0.04, badgeY - rh * 0.008);
  c.textAlign = 'right';
  c.fillStyle = '#3a342a';
  c.fillText(`${claimedSet.size} / ${GYM_BADGES.length} EARNED`, rx + rw - rw * 0.04, badgeY - rh * 0.008);

  const badgeSlotW = (rw * 0.92) / GYM_BADGES.length;
  GYM_BADGES.forEach((badge, i) => {
    const bx = rx + rw * 0.04 + i * badgeSlotW;
    const claimed = claimedSet.has(badge.id);
    drawBadge(c, bx + badgeSlotW * 0.10, badgeY, badgeSlotW * 0.80, badgeH, badge, claimed);
  });

  // 6-mon team strip
  const teamY = badgeY + badgeH + rh * 0.04;
  const teamH = rh * 0.24;
  c.fillStyle = '#1b1a17';
  c.textAlign = 'left';
  c.font = `bold ${rh * 0.022}px "JetBrains Mono", monospace`;
  c.fillText('// PARTY OF SIX', rx + rw * 0.04, teamY - rh * 0.008);

  const slotW = (rw * 0.92) / 6;
  for (let i = 0; i < 6; i++) {
    const entry = entries[i];
    const sx = rx + rw * 0.04 + i * slotW;
    if (!entry) {
      // Empty slot indicator
      c.strokeStyle = '#cdc4ad';
      c.lineWidth = 2;
      c.setLineDash([6, 4]);
      c.strokeRect(sx + slotW * 0.05, teamY, slotW * 0.90, teamH);
      c.setLineDash([]);
      continue;
    }
    const primary = TYPE_COLORS[entry.pokemon.types[0]] || '#f4ae3c';

    // Slot background
    c.fillStyle = primary + '15';
    c.fillRect(sx + slotW * 0.05, teamY, slotW * 0.90, teamH);

    // Sprite
    const spriteSize = teamH * 0.70;
    c.drawImage(entry.img, sx + (slotW - spriteSize) / 2, teamY + teamH * 0.05, spriteSize, spriteSize);

    // Shiny + Tera indicators (top-right corner)
    if (entry.member.shiny) {
      c.fillStyle = '#fde047';
      c.font = `bold ${teamH * 0.16}px "Sora", system-ui`;
      c.textAlign = 'right';
      c.fillText('★', sx + slotW * 0.93, teamY + teamH * 0.18);
    }
    if (entry.member.teraType) {
      const teraColor = TYPE_COLORS[entry.member.teraType] || '#fffbf0';
      c.fillStyle = teraColor;
      c.beginPath();
      c.arc(sx + slotW * 0.88, teamY + teamH * 0.28, teamH * 0.05, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#1b1a17';
      c.lineWidth = 1;
      c.stroke();
    }

    // Nickname (bottom)
    c.fillStyle = '#1b1a17';
    c.textAlign = 'center';
    c.font = `bold ${teamH * 0.10}px "JetBrains Mono", monospace`;
    const label = (entry.member.nickname || entry.pokemon.display).toUpperCase();
    c.fillText(label.length > 10 ? label.slice(0, 9) + '…' : label, sx + slotW / 2, teamY + teamH * 0.86);

    c.fillStyle = primary;
    c.font = `${teamH * 0.08}px "JetBrains Mono", monospace`;
    c.fillText(padId(entry.pokemon.id), sx + slotW / 2, teamY + teamH * 0.98);
  }

  // Footer band — motto / share code
  const footerY = teamY + teamH + rh * 0.04;
  const footerH = rh * 0.08;
  c.fillStyle = '#1b1a17';
  c.fillRect(rx, footerY, rw, footerH);

  c.fillStyle = '#f4ae3c';
  c.textAlign = 'center';
  const motto = ctx.trainer?.motto || ctx.badgeText || 'Train. Battle. Become Champion.';
  c.font = `${footerH * 0.30}px "JetBrains Mono", monospace`;
  c.fillText(`"${motto}"`, rx + rw / 2, footerY + footerH * 0.5);

  c.fillStyle = '#fffbf0';
  c.font = `${footerH * 0.18}px "JetBrains Mono", monospace`;
  c.fillText(`SHARE CODE · ${ctx.code}`, rx + rw / 2, footerY + footerH * 0.85);
}

/**
 * Draw a single gym badge with the canonical Kanto shape silhouettes.
 * Claimed = full-color filled; unclaimed = grey outline only.
 */
function drawBadge(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, badge: GymBadgeInfo, claimed: boolean): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) * 0.42;

  c.save();
  if (!claimed) {
    c.globalAlpha = 0.25;
  }
  c.fillStyle = claimed ? badge.color : '#cdc4ad';
  c.strokeStyle = claimed ? '#1b1a17' : '#7d7560';
  c.lineWidth = Math.max(1.5, w * 0.025);

  c.beginPath();
  switch (badge.shape) {
    case 'octagon':
      // Boulder Badge — flat octagon
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.closePath();
      break;
    case 'cascade':
      // Cascade Badge — water drop (teardrop)
      c.moveTo(cx, cy - r);
      c.bezierCurveTo(cx + r * 0.9, cy - r * 0.6, cx + r * 0.9, cy + r * 0.5, cx, cy + r);
      c.bezierCurveTo(cx - r * 0.9, cy + r * 0.5, cx - r * 0.9, cy - r * 0.6, cx, cy - r);
      c.closePath();
      break;
    case 'thunder':
      // Thunder Badge — lightning bolt zigzag
      c.moveTo(cx - r * 0.4, cy - r);
      c.lineTo(cx + r * 0.3, cy - r * 0.2);
      c.lineTo(cx - r * 0.1, cy);
      c.lineTo(cx + r * 0.4, cy + r);
      c.lineTo(cx - r * 0.3, cy + r * 0.2);
      c.lineTo(cx + r * 0.1, cy);
      c.closePath();
      break;
    case 'rainbow':
      // Rainbow Badge — flower petals (5-point)
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        const next = (Math.PI * 2 * (i + 0.5)) / 5 - Math.PI / 2;
        const ix = cx + Math.cos(next) * r * 0.5;
        const iy = cy + Math.sin(next) * r * 0.5;
        if (i === 0) c.moveTo(px, py);
        c.lineTo(ix, iy);
        const na = (Math.PI * 2 * (i + 1)) / 5 - Math.PI / 2;
        c.lineTo(cx + Math.cos(na) * r, cy + Math.sin(na) * r);
      }
      c.closePath();
      break;
    case 'soul':
      // Soul Badge — heart
      c.moveTo(cx, cy - r * 0.3);
      c.bezierCurveTo(cx, cy - r, cx - r, cy - r, cx - r, cy - r * 0.3);
      c.bezierCurveTo(cx - r, cy + r * 0.3, cx, cy + r * 0.7, cx, cy + r);
      c.bezierCurveTo(cx, cy + r * 0.7, cx + r, cy + r * 0.3, cx + r, cy - r * 0.3);
      c.bezierCurveTo(cx + r, cy - r, cx, cy - r, cx, cy - r * 0.3);
      c.closePath();
      break;
    case 'marsh':
      // Marsh Badge — gold disc with center dot
      c.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case 'volcano':
      // Volcano Badge — flame (asymmetric)
      c.moveTo(cx, cy + r);
      c.bezierCurveTo(cx - r, cy + r * 0.3, cx - r * 0.6, cy - r * 0.5, cx, cy - r);
      c.bezierCurveTo(cx + r * 0.3, cy - r * 0.4, cx + r * 0.4, cy + r * 0.2, cx, cy + r);
      c.closePath();
      break;
    case 'earth':
      // Earth Badge — sun / star burst (8 points)
      for (let i = 0; i < 16; i++) {
        const a = (Math.PI * 2 * i) / 16 - Math.PI / 2;
        const radius = i % 2 === 0 ? r : r * 0.6;
        const px = cx + Math.cos(a) * radius;
        const py = cy + Math.sin(a) * radius;
        i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.closePath();
      break;
  }
  c.fill();
  c.stroke();
  c.restore();
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

/**
 * Render a print-ready merchandise design at the product's full print dimensions.
 * Returns a PNG Blob suitable for direct upload to Printful/Printify/etc.
 */
export async function renderMerchDesign(ctx: MerchRenderContext): Promise<Blob> {
  const { product } = ctx;
  const { canvas, ctx: c } = setupCanvas(product.printWidth, product.printHeight);
  const isApparel = product.category === 'apparel' || product.category === 'tote' || product.category === 'phone-case';
  const transparent = ctx.transparentBg ?? isApparel;

  // Background
  if (!transparent) {
    // Full-bleed cream paper for posters/mugs/mousepads
    c.fillStyle = '#f5ead2';
    c.fillRect(0, 0, product.printWidth, product.printHeight);
  }

  const region = computeDesignRegion(product.printWidth, product.printHeight, isApparel);

  switch (ctx.design) {
    case 'crest':         await renderCrest(c, region, ctx); break;
    case 'roster':        await renderRoster(c, region, ctx); break;
    case 'id-card':       await renderIdCard(c, region, ctx); break;
    case 'banner':        await renderBanner(c, region, ctx); break;
    case 'lineup':        await renderRoster(c, region, ctx); break;
    case 'sigil':         await renderCrest(c, region, ctx); break;
    case 'trainer-card':  await renderTrainerCard(c, region, ctx); break;
    default:              await renderCrest(c, region, ctx);
  }

  return toBlob(canvas);
}

/**
 * Generate a *low-res preview* (max 1024px on the long side) for the merch picker UI.
 * Used for the in-app mockup — the high-res print file is generated only when the user
 * downloads/orders.
 */
export async function renderMerchPreview(ctx: MerchRenderContext): Promise<Blob> {
  const { product } = ctx;
  const max = 1024;
  const scale = max / Math.max(product.printWidth, product.printHeight);
  const previewW = Math.round(product.printWidth * scale);
  const previewH = Math.round(product.printHeight * scale);

  const { canvas, ctx: c } = setupCanvas(previewW, previewH);
  const isApparel = product.category === 'apparel' || product.category === 'tote' || product.category === 'phone-case';
  const transparent = ctx.transparentBg ?? isApparel;

  if (!transparent) {
    c.fillStyle = '#f5ead2';
    c.fillRect(0, 0, previewW, previewH);
  }

  const region = computeDesignRegion(previewW, previewH, isApparel);
  switch (ctx.design) {
    case 'crest':   await renderCrest(c, region, ctx); break;
    case 'roster':  await renderRoster(c, region, ctx); break;
    case 'id-card': await renderIdCard(c, region, ctx); break;
    case 'banner':  await renderBanner(c, region, ctx); break;
    case 'lineup':  await renderRoster(c, region, ctx); break;
    case 'sigil':   await renderCrest(c, region, ctx); break;
    default:        await renderCrest(c, region, ctx);
  }
  return toBlob(canvas);
}

// ============================================================
// MERCH DESIGN METADATA
// ============================================================

export interface MerchDesignInfo {
  id: MerchDesign;
  label: string;
  desc: string;
  recommendedFor: string[];   // category labels
}

export const MERCH_DESIGNS: MerchDesignInfo[] = [
  { id: 'crest',         label: 'Team Crest',      desc: 'circular badge · gold ring · 6 sprites around a monogram', recommendedFor: ['shirt', 'hoodie', 'mug', 'sticker'] },
  { id: 'roster',        label: 'Champion Roster', desc: 'horizontal sprite strip · trainer name + region',           recommendedFor: ['mug', 'mousepad', 'tee back'] },
  { id: 'id-card',       label: 'Trainer ID Card', desc: 'license-style badge · photo + region + party slot row',     recommendedFor: ['poster', 'sticker', 'phone case'] },
  { id: 'banner',        label: 'Gym Banner',      desc: 'tall pennant · 6 typed blocks stacked vertically',          recommendedFor: ['poster', 'phone case'] },
  // v6 — full trainer card with gym badges
  { id: 'trainer-card',  label: 'Trainer Card',    desc: 'signature mon + 8 gym badges + 6-mon party + motto',         recommendedFor: ['poster', 'sticker', 'phone case'] },
];
