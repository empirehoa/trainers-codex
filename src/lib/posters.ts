// Canvas-based poster renderers for the team.
// Each renderer is async and returns a Blob (PNG).
// Sprites are loaded with crossOrigin='anonymous' so toBlob works.

import type { Pokemon, TeamMember, TrainerProfile } from './types';
import { TYPE_COLORS } from './constants';
import { spriteUrl, padId, POKEMON_BY_ID } from './pokemon';
import type { ArtStyle } from './constants';
import { ellipsize, fitLine } from './canvas-text';

export interface PosterContext {
  team: (TeamMember | null)[];
  trainer: TrainerProfile | null;
  teamName: string;
  code: string;
  style: ArtStyle;
}

const WIDTH = 1080;
const HEIGHT = 1350;  // 4:5 ratio for IG portrait
// Titles and mottos are user text. Every renderer fits them to the canvas with
// `ellipsize` / `fitLine` (lib/canvas-text.ts) — a 60-character name used to
// run straight off the 1080px edge.
const TITLE_MAX_W = WIDTH - 120;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('img failed: ' + src));
    img.src = src;
  });
}

async function loadTeamImages(team: (TeamMember | null)[], kind: 'pixel' | 'artwork' | 'home') {
  const filled = team.filter((m): m is TeamMember => m !== null);
  const results = await Promise.all(filled.map(async m => {
    const pokemon = POKEMON_BY_ID[m.id];
    if (!pokemon) return null;
    const variant = kind === 'pixel'
      ? (m.shiny ? 'pixel-shiny' : 'pixel-default')
      : kind === 'artwork'
        ? (m.shiny ? 'artwork-shiny' : 'artwork-default')
        : (m.shiny ? 'home-shiny' : 'home-default');
    try {
      const img = await loadImg(spriteUrl(m.id, variant));
      return { pokemon, member: m, img };
    } catch {
      try {
        const fallback = await loadImg(spriteUrl(m.id, 'pixel-default'));
        return { pokemon, member: m, img: fallback };
      } catch {
        return null;
      }
    }
  }));
  return results.filter((x): x is { pokemon: Pokemon; member: TeamMember; img: HTMLImageElement } => x !== null);
}

function setupCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  return { canvas, ctx };
}

// Attribution watermark stamped on every poster, regardless of style, right
// before export. Shared chokepoint so all 12 renderers brand consistently and
// shared images drive traffic back. The translucent dark chip + cream text
// reads on both the dark (CRT/arcade) and cream-paper (zine/polaroid) styles.
const WATERMARK = 'trainerscodex.com';
function stampWatermark(canvas: HTMLCanvasElement): void {
  const c = canvas.getContext('2d');
  if (!c) return;
  c.save();
  c.font = '600 22px "JetBrains Mono", ui-monospace, monospace';
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  const padX = 14, padY = 9, margin = 26;
  const textW = c.measureText(WATERMARK).width;
  const chipW = textW + padX * 2;
  const chipH = 22 + padY * 2;
  const x = canvas.width - margin - chipW;
  const y = canvas.height - margin - chipH;
  c.globalAlpha = 1;
  c.fillStyle = 'rgba(10,8,6,0.55)';
  if (typeof (c as { roundRect?: unknown }).roundRect === 'function') {
    c.beginPath();
    (c as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void })
      .roundRect(x, y, chipW, chipH, 8);
    c.fill();
  } else {
    c.fillRect(x, y, chipW, chipH);
  }
  c.fillStyle = 'rgba(245,234,210,0.95)';
  c.fillText(WATERMARK, x + padX, y + chipH / 2 + 1);
  c.restore();
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  stampWatermark(canvas);
  return new Promise((res, rej) => {
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png');
  });
}

// Common: trainer pill
async function drawTrainerPill(ctx: CanvasRenderingContext2D, trainer: TrainerProfile | null, x: number, y: number, opts: { color?: string; titleColor?: string } = {}) {
  if (!trainer) return;
  const c = opts.color || '#f5ead2';
  const tc = opts.titleColor || '#f4ae3c';

  // Optional avatar
  if (trainer.customAvatarDataUrl) {
    try {
      const img = await loadImg(trainer.customAvatarDataUrl);
      const r = 30;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, x, y, r * 2, r * 2);
      ctx.restore();
      ctx.strokeStyle = tc;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, Math.PI * 2); ctx.stroke();
      x += r * 2 + 16;
    } catch { /* decorative badge row — skip one rather than abandon the poster */ }
  }
  ctx.fillStyle = c;
  ctx.font = 'bold 30px "Sora", system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(trainer.name, x, y + 32);
  if (trainer.title) {
    ctx.fillStyle = tc;
    ctx.font = '18px "JetBrains Mono", monospace';
    ctx.fillText(trainer.title.toUpperCase(), x, y + 56);
  }
}

// ============================================================
// STYLE 1 — CRT Manifest (signature style)
// ============================================================
async function renderCRTManifest(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Background
  const bg = c.createRadialGradient(W/2, H*0.4, 100, W/2, H*0.4, W);
  bg.addColorStop(0, '#1a1611');
  bg.addColorStop(1, '#0c0a08');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  // Scan lines
  c.fillStyle = 'rgba(244,174,60,0.025)';
  for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);

  // Vignette
  const vig = c.createRadialGradient(W/2, H/2, W*0.3, W/2, H/2, W*0.7);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(0,0,0,0.6)');
  c.fillStyle = vig; c.fillRect(0, 0, W, H);

  // Title
  c.fillStyle = '#f4ae3c';
  c.font = 'bold 56px "Major Mono Display", monospace';
  c.textAlign = 'center';
  c.fillText("TRAINER'S CODEX", W/2, 90);
  c.font = ctx.teamName ? '28px "Sora", system-ui' : '24px "JetBrains Mono", monospace';
  c.fillStyle = ctx.teamName ? '#f5ead2' : '#8a7e62';
  c.fillText(ellipsize(c, ctx.teamName ? `"${ctx.teamName}"` : '// 6-pokémon team manifest', TITLE_MAX_W), W/2, 130);

  await drawTrainerPill(c, ctx.trainer, 40, 160);

  // Grid 2x3
  const imgs = await loadTeamImages(ctx.team, 'pixel');
  const cellW = (W - 80) / 3;
  const cellH = 310;
  const startY = 240;
  c.imageSmoothingEnabled = false;

  imgs.forEach((entry, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 40 + col * cellW;
    const y = startY + row * cellH;
    const primary = TYPE_COLORS[entry.pokemon.types[0]];

    // Box
    c.strokeStyle = primary + '66';
    c.lineWidth = 2;
    c.strokeRect(x + 10, y + 10, cellW - 20, cellH - 30);
    c.fillStyle = primary + '11';
    c.fillRect(x + 10, y + 10, cellW - 20, cellH - 30);

    // Shiny halo
    if (entry.member.shiny) {
      const grd = c.createRadialGradient(x + cellW/2, y + 100, 20, x + cellW/2, y + 100, 120);
      grd.addColorStop(0, 'rgba(253,224,71,0.4)');
      grd.addColorStop(1, 'transparent');
      c.fillStyle = grd;
      c.fillRect(x + 10, y + 10, cellW - 20, cellH - 30);
    }

    // Sprite (pixel-art scaling)
    const size = 180;
    c.drawImage(entry.img, x + (cellW - size) / 2, y + 30, size, size);

    // Name
    c.fillStyle = '#f5ead2';
    c.font = 'bold 22px "Sora", system-ui';
    c.textAlign = 'center';
    const name = entry.member.nickname || entry.pokemon.display;
    c.fillText(name, x + cellW/2, y + 235);
    // Padded ID
    c.fillStyle = '#8a7e62';
    c.font = '14px "JetBrains Mono", monospace';
    c.fillText(padId(entry.pokemon.id), x + cellW/2, y + 254);
    // Types
    c.font = '16px "JetBrains Mono", monospace';
    c.fillStyle = primary;
    c.fillText(entry.pokemon.types.join(' · ').toUpperCase(), x + cellW/2, y + 275);

    if (entry.member.shiny) {
      c.fillStyle = '#fde047';
      c.font = '14px "JetBrains Mono", monospace';
      c.fillText('⭐ SHINY', x + cellW/2, y + 295);
    } else {
      c.fillStyle = '#5a4a3a';
      c.font = '13px "JetBrains Mono", monospace';
      c.fillText(`BST ${entry.pokemon.bst}`, x + cellW/2, y + 295);
    }
  });

  // Footer
  c.font = '20px "JetBrains Mono", monospace';
  c.fillStyle = '#f4ae3c';
  c.textAlign = 'center';
  c.fillText(`team code: ${ctx.code}`, W/2, H - 90);

  if (ctx.trainer?.motto) {
    c.font = 'italic 18px "Sora", system-ui';
    c.fillStyle = '#8a7e62';
    c.fillText(ellipsize(c, `"${ctx.trainer.motto}"`, TITLE_MAX_W), W/2, H - 60);
  }

  c.font = '12px "JetBrains Mono", monospace';
  c.fillStyle = '#3a3225';
  c.fillText('trainerscodex · independent fan tool · not affiliated', W/2, H - 30);

  return toBlob(canvas);
}

// ============================================================
// STYLE 2 — Pixel Grid (clean, no scan lines)
// ============================================================
async function renderPixelGrid(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Background — light parchment
  c.fillStyle = '#f4ead2';
  c.fillRect(0, 0, W, H);

  // Grid pattern
  c.strokeStyle = 'rgba(60, 50, 40, 0.06)';
  c.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y < H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }

  // Title block
  c.fillStyle = '#0c0a08';
  c.fillRect(40, 40, W - 80, 130);
  c.fillStyle = '#f4ae3c';
  c.font = 'bold 60px "Major Mono Display", monospace';
  c.textAlign = 'center';
  c.fillText("TEAM ROSTER", W/2, 110);
  c.fillStyle = '#f5ead2';
  c.font = '20px "JetBrains Mono", monospace';
  c.fillText(ellipsize(c, ctx.teamName || '// untitled team', TITLE_MAX_W), W/2, 145);

  await drawTrainerPill(c, ctx.trainer, 40, 200, { color: '#0c0a08', titleColor: '#a16207' });

  // Grid 2x3
  const imgs = await loadTeamImages(ctx.team, 'pixel');
  const cellW = (W - 80) / 3;
  const cellH = 290;
  const startY = 290;
  c.imageSmoothingEnabled = false;

  imgs.forEach((entry, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 40 + col * cellW;
    const y = startY + row * cellH;
    const primary = TYPE_COLORS[entry.pokemon.types[0]];

    // Card
    c.fillStyle = '#fff';
    c.fillRect(x + 8, y + 8, cellW - 16, cellH - 24);
    c.strokeStyle = primary;
    c.lineWidth = 3;
    c.strokeRect(x + 8, y + 8, cellW - 16, cellH - 24);

    // Number block
    c.fillStyle = primary;
    c.fillRect(x + 8, y + 8, cellW - 16, 28);
    c.fillStyle = '#fff';
    c.font = 'bold 16px "JetBrains Mono", monospace';
    c.textAlign = 'left';
    c.fillText(padId(entry.pokemon.id), x + 18, y + 28);
    c.textAlign = 'right';
    c.fillText(`BST ${entry.pokemon.bst}`, x + cellW - 18, y + 28);

    // Sprite
    const size = 160;
    c.drawImage(entry.img, x + (cellW - size) / 2, y + 50, size, size);

    if (entry.member.shiny) {
      c.font = '20px monospace';
      c.fillStyle = '#eab308';
      c.textAlign = 'left';
      c.fillText('⭐', x + 14, y + 60);
    }

    // Name
    c.fillStyle = '#0c0a08';
    c.font = 'bold 22px "Sora", system-ui';
    c.textAlign = 'center';
    const name = entry.member.nickname || entry.pokemon.display;
    c.fillText(name, x + cellW/2, y + 230);
    // Types
    c.font = '14px "JetBrains Mono", monospace';
    c.fillStyle = primary;
    c.fillText(entry.pokemon.types.join(' · ').toUpperCase(), x + cellW/2, y + 253);
  });

  c.fillStyle = '#0c0a08';
  c.font = '16px "JetBrains Mono", monospace';
  c.textAlign = 'center';
  c.fillText(`code: ${ctx.code}  ·  trainerscodex`, W/2, H - 30);

  return toBlob(canvas);
}

// ============================================================
// STYLE 3 — Editorial (premium look, large artwork)
// ============================================================
async function renderEditorial(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Background — moody dark with gradient
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a1611');
  bg.addColorStop(1, '#000');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  // Top type strip
  const imgs = await loadTeamImages(ctx.team, 'artwork');
  const allTypes = Array.from(new Set(imgs.flatMap(i => i.pokemon.types)));
  let stripX = 0;
  const stripW = W / allTypes.length;
  allTypes.forEach((t, i) => {
    c.fillStyle = TYPE_COLORS[t] + '80';
    c.fillRect(stripX, 0, stripW, 14);
    stripX += stripW;
    void i;
  });

  // Title — serif
  c.fillStyle = '#f5ead2';
  c.font = 'bold 80px "Major Mono Display", "Georgia", serif';
  c.textAlign = 'left';
  c.fillText("THE", 60, 110);
  c.fillText("SIX", 60, 190);
  c.font = '24px "JetBrains Mono", monospace';
  c.fillStyle = '#f4ae3c';
  c.fillText(ellipsize(c, ctx.teamName || '// untitled team', TITLE_MAX_W), 60, 230);

  await drawTrainerPill(c, ctx.trainer, W - 280, 50, { color: '#f5ead2', titleColor: '#f4ae3c' });

  // 3x2 large artwork
  const cellW = (W - 80) / 3;
  const cellH = 320;
  const startY = 290;

  imgs.forEach((entry, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 40 + col * cellW;
    const y = startY + row * cellH;
    const primary = TYPE_COLORS[entry.pokemon.types[0]];

    // Soft glow
    const grd = c.createRadialGradient(x + cellW/2, y + 140, 20, x + cellW/2, y + 140, 180);
    grd.addColorStop(0, primary + '55');
    grd.addColorStop(1, 'transparent');
    c.fillStyle = grd;
    c.fillRect(x, y, cellW, cellH);

    // Artwork
    c.imageSmoothingEnabled = true;
    const size = 240;
    c.drawImage(entry.img, x + (cellW - size) / 2, y + 30, size, size);

    if (entry.member.shiny) {
      c.font = '22px serif';
      c.fillStyle = '#fde047';
      c.textAlign = 'right';
      c.fillText('★', x + cellW - 20, y + 50);
    }

    // Name (large serif)
    c.fillStyle = '#f5ead2';
    c.font = 'bold 26px "Sora", system-ui';
    c.textAlign = 'center';
    const name = entry.member.nickname || entry.pokemon.display;
    c.fillText(name, x + cellW/2, y + 295);
  });

  // Bottom strip
  c.fillStyle = '#f4ae3c';
  c.fillRect(0, H - 60, W, 4);
  c.fillStyle = '#f5ead2';
  c.font = '14px "JetBrains Mono", monospace';
  c.textAlign = 'left';
  c.fillText('TRAINER\'S CODEX', 40, H - 25);
  c.textAlign = 'right';
  c.fillStyle = '#8a7e62';
  c.fillText(ctx.code, W - 40, H - 25);

  return toBlob(canvas);
}

// ============================================================
// STYLE 4 — Game Boy mono
// ============================================================
async function renderGameBoy(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Game Boy palette — DMG green
  const palette = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];

  c.fillStyle = palette[3];
  c.fillRect(0, 0, W, H);

  // Pixel border
  c.fillStyle = palette[0];
  c.fillRect(0, 0, W, 18);
  c.fillRect(0, H - 18, W, 18);
  c.fillRect(0, 0, 18, H);
  c.fillRect(W - 18, 0, 18, H);

  // Title
  c.fillStyle = palette[0];
  c.font = 'bold 56px "Major Mono Display", monospace';
  c.textAlign = 'center';
  c.fillText("TEAM ROSTER", W/2, 110);
  c.font = '20px "JetBrains Mono", monospace';
  c.fillText(ellipsize(c, ctx.teamName.toUpperCase() || '— UNTITLED —', TITLE_MAX_W), W/2, 145);

  await drawTrainerPill(c, ctx.trainer, 30, 170, { color: palette[0], titleColor: palette[0] });

  // 6 mons grid — desaturate sprites to GB palette
  const imgs = await loadTeamImages(ctx.team, 'pixel');
  const cellW = (W - 80) / 3;
  const cellH = 320;
  const startY = 270;
  c.imageSmoothingEnabled = false;

  for (let i = 0; i < imgs.length; i++) {
    const entry = imgs[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 40 + col * cellW;
    const y = startY + row * cellH;

    // Box
    c.strokeStyle = palette[0];
    c.lineWidth = 4;
    c.strokeRect(x + 10, y + 10, cellW - 20, cellH - 30);
    c.fillStyle = palette[2];
    c.fillRect(x + 10, y + 10, cellW - 20, cellH - 30);

    // Desaturate the sprite
    const off = document.createElement('canvas');
    off.width = 200; off.height = 200;
    const oc = off.getContext('2d');
    if (oc) {
      oc.imageSmoothingEnabled = false;
      oc.drawImage(entry.img, 0, 0, 200, 200);
      const data = oc.getImageData(0, 0, 200, 200);
      for (let p = 0; p < data.data.length; p += 4) {
        const alpha = data.data[p + 3];
        if (alpha < 50) continue;
        const lum = (data.data[p] * 0.3 + data.data[p+1] * 0.59 + data.data[p+2] * 0.11);
        // Quantize to 4 levels
        const idx = lum < 64 ? 0 : lum < 128 ? 1 : lum < 192 ? 2 : 3;
        const hex = palette[idx];
        data.data[p] = parseInt(hex.slice(1, 3), 16);
        data.data[p+1] = parseInt(hex.slice(3, 5), 16);
        data.data[p+2] = parseInt(hex.slice(5, 7), 16);
      }
      oc.putImageData(data, 0, 0);
      c.drawImage(off, x + (cellW - 180) / 2, y + 30, 180, 180);
    }

    // Name
    c.fillStyle = palette[0];
    c.font = 'bold 22px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    const name = entry.member.nickname || entry.pokemon.display;
    c.fillText(name.toUpperCase(), x + cellW/2, y + 240);
    c.font = '14px "JetBrains Mono", monospace';
    c.fillText(`Lv.${50 + (entry.pokemon.bst % 50)}  HP:${entry.pokemon.stats.hp}`, x + cellW/2, y + 265);
    if (entry.member.shiny) c.fillText('★ SHINY ★', x + cellW/2, y + 288);
  }

  c.fillStyle = palette[0];
  c.font = '16px "JetBrains Mono", monospace';
  c.textAlign = 'center';
  c.fillText(`>${ctx.code}<`, W/2, H - 35);

  return toBlob(canvas);
}

// ============================================================
// STYLE 5 — Arcade Cabinet (neon)
// ============================================================
async function renderArcadeCabinet(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Dark background
  c.fillStyle = '#0a0014';
  c.fillRect(0, 0, W, H);

  // Synthwave horizon (grid lines toward center)
  c.strokeStyle = 'rgba(244, 174, 60, 0.4)';
  c.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    const y = H * 0.4 + i * i * 2.5;
    if (y > H) break;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  for (let i = -10; i <= 10; i++) {
    c.beginPath();
    c.moveTo(W/2, H * 0.4);
    c.lineTo(W/2 + i * 200, H);
    c.stroke();
  }

  // Sun
  const sun = c.createRadialGradient(W/2, H * 0.35, 20, W/2, H * 0.35, 220);
  sun.addColorStop(0, '#fff');
  sun.addColorStop(0.5, '#f4ae3c');
  sun.addColorStop(1, 'transparent');
  c.fillStyle = sun;
  c.fillRect(0, 0, W, H);

  // Title — neon glow
  c.shadowBlur = 30;
  c.shadowColor = '#ff00ff';
  c.fillStyle = '#fff';
  c.font = 'bold 80px "Major Mono Display", monospace';
  c.textAlign = 'center';
  c.fillText("INSERT COIN", W/2, 130);
  c.shadowBlur = 0;
  c.font = '22px "JetBrains Mono", monospace';
  c.fillStyle = '#fde047';
  c.fillText(`★ ${ellipsize(c, (ctx.teamName || 'PARTY OF SIX').toUpperCase(), TITLE_MAX_W - 80)} ★`, W/2, 170);

  await drawTrainerPill(c, ctx.trainer, 40, 200, { color: '#fff', titleColor: '#ff00ff' });

  // Mons grid (artwork, large)
  const imgs = await loadTeamImages(ctx.team, 'artwork');
  const cellW = (W - 80) / 3;
  const cellH = 320;
  const startY = 300;

  imgs.forEach((entry, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 40 + col * cellW;
    const y = startY + row * cellH;
    const primary = TYPE_COLORS[entry.pokemon.types[0]];

    // Neon outline
    c.shadowBlur = 20;
    c.shadowColor = primary;
    c.strokeStyle = primary;
    c.lineWidth = 3;
    c.strokeRect(x + 10, y + 10, cellW - 20, cellH - 30);
    c.shadowBlur = 0;

    // Artwork
    c.imageSmoothingEnabled = true;
    const size = 220;
    c.drawImage(entry.img, x + (cellW - size) / 2, y + 30, size, size);

    if (entry.member.shiny) {
      c.shadowBlur = 15;
      c.shadowColor = '#fde047';
      c.font = '24px serif';
      c.fillStyle = '#fde047';
      c.textAlign = 'right';
      c.fillText('★', x + cellW - 20, y + 50);
      c.shadowBlur = 0;
    }

    // Name
    c.fillStyle = '#fff';
    c.font = 'bold 24px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    const name = (entry.member.nickname || entry.pokemon.display).toUpperCase();
    c.fillText(name, x + cellW/2, y + 280);
  });

  c.shadowBlur = 0;
  c.fillStyle = '#ff00ff';
  c.font = 'bold 18px "JetBrains Mono", monospace';
  c.textAlign = 'center';
  c.fillText(`>> ${ctx.code} <<`, W/2, H - 30);

  return toBlob(canvas);
}

// ============================================================
// STYLE 6 — Polaroid stack
// ============================================================
async function renderPolaroid(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Cork-board background
  c.fillStyle = '#3a2a1a';
  c.fillRect(0, 0, W, H);
  // Texture
  for (let i = 0; i < 400; i++) {
    c.fillStyle = `rgba(${100 + Math.random() * 50}, ${70 + Math.random() * 30}, ${40 + Math.random() * 20}, 0.3)`;
    c.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  // Title strip — masking tape
  c.save();
  c.fillStyle = '#f4ae3c';
  c.globalAlpha = 0.85;
  c.translate(W/2, 80);
  c.rotate(-0.05);
  c.fillRect(-200, -30, 400, 60);
  c.restore();
  c.fillStyle = '#0c0a08';
  c.font = 'bold 30px "Sora", system-ui';
  c.textAlign = 'center';
  c.fillText(ellipsize(c, ctx.teamName || "trainer's team", TITLE_MAX_W), W/2, 90);

  await drawTrainerPill(c, ctx.trainer, 60, 130, { color: '#f5ead2', titleColor: '#f4ae3c' });

  // Polaroids — randomly rotated
  const imgs = await loadTeamImages(ctx.team, 'artwork');
  const polW = 280, polH = 340;
  const positions: Array<[number, number, number]> = [
    [60, 240, -0.08],
    [400, 200, 0.05],
    [740, 250, -0.04],
    [120, 620, 0.06],
    [430, 660, -0.07],
    [760, 620, 0.04],
  ];

  imgs.forEach((entry, i) => {
    const [px, py, rot] = positions[i % positions.length];
    c.save();
    c.translate(px + polW/2, py + polH/2);
    c.rotate(rot);
    c.translate(-polW/2, -polH/2);

    // Shadow
    c.shadowBlur = 18;
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowOffsetY = 6;

    // Paper
    c.fillStyle = '#f5ead2';
    c.fillRect(0, 0, polW, polH);
    c.shadowBlur = 0; c.shadowOffsetY = 0;

    // Photo area
    c.fillStyle = '#1a1611';
    c.fillRect(15, 15, polW - 30, polW - 30);

    // Artwork
    c.imageSmoothingEnabled = true;
    const size = polW - 50;
    c.drawImage(entry.img, 25, 25, size, size);

    if (entry.member.shiny) {
      c.font = '20px serif';
      c.fillStyle = '#eab308';
      c.textAlign = 'right';
      c.fillText('★', polW - 25, 45);
    }

    // Handwritten caption
    c.fillStyle = '#0c0a08';
    c.font = 'italic 22px "Sora", system-ui';
    c.textAlign = 'center';
    const name = entry.member.nickname || entry.pokemon.display;
    c.fillText(name, polW/2, polW + 50);

    c.restore();
  });

  c.fillStyle = '#f5ead2';
  c.font = '14px "JetBrains Mono", monospace';
  c.textAlign = 'center';
  c.fillText(`${ctx.code}  ·  trainerscodex`, W/2, H - 30);

  return toBlob(canvas);
}

// ============================================================
// STYLE 7 — Sticker Sheet (pastel pop)
// ============================================================
async function renderStickerSheet(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Pastel gradient
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#fce7f3');
  bg.addColorStop(0.5, '#fef3c7');
  bg.addColorStop(1, '#dbeafe');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  // Polka dots
  for (let i = 0; i < 50; i++) {
    c.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.4})`;
    c.beginPath();
    c.arc(Math.random() * W, Math.random() * H, 5 + Math.random() * 30, 0, Math.PI * 2);
    c.fill();
  }

  c.fillStyle = '#9333ea';
  c.font = 'bold 70px "Major Mono Display", monospace';
  c.textAlign = 'center';
  c.fillText("CATCH 'EM ALL", W/2, 110);
  c.font = '24px "JetBrains Mono", monospace';
  c.fillStyle = '#0c0a08';
  c.fillText(ellipsize(c, ctx.teamName || '// the chosen six', TITLE_MAX_W), W/2, 150);

  await drawTrainerPill(c, ctx.trainer, 60, 180, { color: '#0c0a08', titleColor: '#9333ea' });

  // Sticker mons (circular with white outline)
  const imgs = await loadTeamImages(ctx.team, 'artwork');
  const cellW = (W - 100) / 3;
  const cellH = 320;
  const startY = 280;

  imgs.forEach((entry, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 50 + col * cellW + cellW/2;
    const y = startY + row * cellH + cellH/2 - 30;
    const r = 130;
    const primary = TYPE_COLORS[entry.pokemon.types[0]];

    // Sticker shadow
    c.shadowBlur = 15;
    c.shadowColor = 'rgba(0,0,0,0.25)';
    c.shadowOffsetY = 4;
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(x, y, r + 10, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0; c.shadowOffsetY = 0;

    // Inner color
    c.fillStyle = primary + '44';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();

    // Artwork clipped to circle
    c.save();
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
    c.imageSmoothingEnabled = true;
    c.drawImage(entry.img, x - r, y - r, r * 2, r * 2);
    c.restore();

    if (entry.member.shiny) {
      c.fillStyle = '#fde047';
      c.font = '30px serif';
      c.textAlign = 'center';
      c.fillText('★', x + r * 0.7, y - r * 0.5);
    }

    // Label
    c.fillStyle = primary;
    c.font = 'bold 22px "Sora", system-ui';
    c.textAlign = 'center';
    const name = entry.member.nickname || entry.pokemon.display;
    c.fillText(name, x, y + r + 35);
  });

  c.fillStyle = '#9333ea';
  c.font = 'bold 16px "JetBrains Mono", monospace';
  c.textAlign = 'center';
  c.fillText(ctx.code, W/2, H - 30);

  return toBlob(canvas);
}

// ============================================================
// STYLE 8 — TCG-style 6-up card sheet
// ============================================================
async function renderTCGCardSheet(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Holo gradient bg
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1a1611');
  bg.addColorStop(0.5, '#3a2a4a');
  bg.addColorStop(1, '#0c0a08');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  // Holo sparkles
  for (let i = 0; i < 80; i++) {
    c.fillStyle = `rgba(${200 + Math.random() * 55}, ${150 + Math.random() * 105}, ${50 + Math.random() * 205}, ${0.3 + Math.random() * 0.5})`;
    c.beginPath();
    c.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 0, Math.PI * 2);
    c.fill();
  }

  c.fillStyle = '#fde047';
  c.font = 'bold 48px "Major Mono Display", monospace';
  c.textAlign = 'center';
  c.fillText("PROOF OF TEAM", W/2, 80);
  c.font = '20px "JetBrains Mono", monospace';
  c.fillStyle = '#f5ead2';
  c.fillText(ellipsize(c, ctx.teamName || '// six-card spread', TITLE_MAX_W), W/2, 110);

  await drawTrainerPill(c, ctx.trainer, 40, 140);

  // Card grid 3x2 — TCG aspect 2.5:3.5
  const imgs = await loadTeamImages(ctx.team, 'artwork');
  const cardW = 280;
  const cardH = 392;
  const gapX = (W - cardW * 3) / 4;
  const gapY = 20;
  const startY = 230;

  imgs.forEach((entry, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = gapX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);
    const primary = TYPE_COLORS[entry.pokemon.types[0]];

    // Card body
    c.fillStyle = '#f5ead2';
    c.fillRect(x, y, cardW, cardH);
    c.strokeStyle = '#0c0a08';
    c.lineWidth = 3;
    c.strokeRect(x, y, cardW, cardH);

    // Header bar
    c.fillStyle = primary;
    c.fillRect(x, y, cardW, 36);
    c.fillStyle = '#fff';
    c.font = 'bold 20px "Sora", system-ui';
    c.textAlign = 'left';
    const name = entry.member.nickname || entry.pokemon.display;
    c.fillText(name, x + 12, y + 25);
    c.textAlign = 'right';
    c.font = 'bold 18px "JetBrains Mono", monospace';
    c.fillText(`HP ${entry.pokemon.stats.hp}`, x + cardW - 12, y + 25);

    // Art box
    c.fillStyle = '#0c0a08';
    c.fillRect(x + 12, y + 48, cardW - 24, 200);
    c.imageSmoothingEnabled = true;
    c.drawImage(entry.img, x + 12, y + 48, cardW - 24, 200);

    if (entry.member.shiny) {
      c.fillStyle = '#fde047';
      c.font = 'bold 22px serif';
      c.textAlign = 'right';
      c.fillText('★', x + cardW - 18, y + 75);
    }

    // Types row
    c.fillStyle = '#0c0a08';
    c.font = 'bold 14px "JetBrains Mono", monospace';
    c.textAlign = 'left';
    c.fillText(entry.pokemon.types.join(' / ').toUpperCase(), x + 14, y + 275);

    // Stats grid
    const stats = entry.pokemon.stats;
    c.font = '13px "JetBrains Mono", monospace';
    const statLines = [
      `ATK ${stats.atk}  SPA ${stats.spa}  SPE ${stats.spe}`,
      `DEF ${stats.def}  SPD ${stats.spd}  BST ${entry.pokemon.bst}`,
    ];
    statLines.forEach((s, j) => c.fillText(s, x + 14, y + 305 + j * 18));

    // Footer
    c.font = '10px "JetBrains Mono", monospace';
    c.fillStyle = '#8a7e62';
    c.textAlign = 'left';
    c.fillText(padId(entry.pokemon.id), x + 14, y + cardH - 12);
    c.textAlign = 'right';
    c.fillText(`gen ${entry.pokemon.gen}`, x + cardW - 14, y + cardH - 12);
  });

  c.fillStyle = '#fde047';
  c.font = '14px "JetBrains Mono", monospace';
  c.textAlign = 'center';
  c.fillText(`code: ${ctx.code}  ·  trainerscodex`, W/2, H - 25);

  return toBlob(canvas);
}

// ============================================================
// v5 NEW STYLES — inspired by 2026 graphic-design trend research
// (Kittl: Type Collage, Blueprint, Grainy Blur) + AI trainer-card sites
// (holographic foil, full-art trading card)
// ============================================================

/**
 * HOLOGRAPHIC FOIL — premium "ultra-rare" feeling.
 * - Diagonal rainbow stripes simulating prismatic foil sheet
 * - Animated-looking sparkles & lens flares (static — single-frame canvas)
 * - Gold metallic border with embossed inner frame
 * - 6 large Pokémon artwork crops layered with overlapping foil glow
 */
async function renderHoloFoil(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Deep midnight base
  c.fillStyle = '#0a0612';
  c.fillRect(0, 0, W, H);

  // Diagonal prismatic foil stripes (rotated rainbow gradient bands)
  c.save();
  c.translate(W/2, H/2);
  c.rotate(-Math.PI / 5);
  c.translate(-W, -H);
  const foilColors = ['#ff006e', '#fb5607', '#ffbe0b', '#8338ec', '#3a86ff', '#06ffa5'];
  for (let i = 0; i < 24; i++) {
    const grad = c.createLinearGradient(0, i * 120, W * 2, i * 120 + 60);
    grad.addColorStop(0, foilColors[i % foilColors.length] + '00');
    grad.addColorStop(0.5, foilColors[i % foilColors.length] + '50');
    grad.addColorStop(1, foilColors[i % foilColors.length] + '00');
    c.fillStyle = grad;
    c.fillRect(0, i * 120, W * 2, 80);
  }
  c.restore();

  // Inner radial spotlight (top)
  const spotlight = c.createRadialGradient(W/2, 250, 80, W/2, 250, 700);
  spotlight.addColorStop(0, 'rgba(255,255,255,0.25)');
  spotlight.addColorStop(0.4, 'rgba(255,200,255,0.1)');
  spotlight.addColorStop(1, 'rgba(10,6,18,0.7)');
  c.fillStyle = spotlight;
  c.fillRect(0, 0, W, H);

  // Sparkles & stars
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const r = 0.5 + Math.random() * 2.5;
    c.globalAlpha = 0.4 + Math.random() * 0.6;
    c.fillStyle = i % 3 === 0 ? '#fde047' : i % 3 === 1 ? '#ffffff' : '#a78bfa';
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    // Cross-flare for ~10% of sparkles
    if (Math.random() < 0.1) {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 0.7;
      c.beginPath();
      c.moveTo(x - r * 4, y); c.lineTo(x + r * 4, y);
      c.moveTo(x, y - r * 4); c.lineTo(x, y + r * 4);
      c.stroke();
    }
  }
  c.globalAlpha = 1;

  // Gold metallic outer border
  const borderGrad = c.createLinearGradient(0, 0, W, 0);
  borderGrad.addColorStop(0, '#7a5d20');
  borderGrad.addColorStop(0.3, '#fde047');
  borderGrad.addColorStop(0.5, '#fff8dc');
  borderGrad.addColorStop(0.7, '#fde047');
  borderGrad.addColorStop(1, '#7a5d20');
  c.strokeStyle = borderGrad;
  c.lineWidth = 16;
  c.strokeRect(20, 20, W - 40, H - 40);
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(255,255,255,0.4)';
  c.strokeRect(40, 40, W - 80, H - 80);

  // Title bar
  c.textAlign = 'center';
  const titleGrad = c.createLinearGradient(W/2 - 250, 0, W/2 + 250, 0);
  titleGrad.addColorStop(0, '#fde047');
  titleGrad.addColorStop(0.5, '#fff8dc');
  titleGrad.addColorStop(1, '#fde047');
  c.fillStyle = titleGrad;
  c.font = 'bold 64px "Major Mono Display", monospace';
  c.fillText('ULTRA RARE', W/2, 140);

  c.fillStyle = '#fff';
  c.font = '22px "Sora", system-ui';
  c.fillText(ellipsize(c, (ctx.teamName || 'six-card spread').toUpperCase(), TITLE_MAX_W), W/2, 175);

  await drawTrainerPill(c, ctx.trainer, W/2 - 100, 200, { color: '#fff', titleColor: '#fde047' });

  // Card grid 3x2 with overlapping foil glow
  const imgs = await loadTeamImages(ctx.team, 'artwork');
  const cardW = 280;
  const cardH = 380;
  const gapX = (W - cardW * 3 - 60) / 4;
  const gapY = 24;
  const startY = 280;

  imgs.forEach((entry, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 30 + gapX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);
    const primary = TYPE_COLORS[entry.pokemon.types[0]];

    // Foil glow behind card
    const glow = c.createRadialGradient(x + cardW/2, y + cardH/2, 0, x + cardW/2, y + cardH/2, cardW * 0.8);
    glow.addColorStop(0, primary + 'cc');
    glow.addColorStop(0.6, primary + '33');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow;
    c.fillRect(x - 30, y - 30, cardW + 60, cardH + 60);

    // Card backing with foil
    const cardBg = c.createLinearGradient(x, y, x + cardW, y + cardH);
    cardBg.addColorStop(0, '#1a1224');
    cardBg.addColorStop(0.5, primary + '40');
    cardBg.addColorStop(1, '#0a0612');
    c.fillStyle = cardBg;
    c.fillRect(x, y, cardW, cardH);

    // Gold inner border
    c.strokeStyle = '#fde047';
    c.lineWidth = 3;
    c.strokeRect(x + 4, y + 4, cardW - 8, cardH - 8);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.strokeRect(x + 10, y + 10, cardW - 20, cardH - 20);

    // Hologram diagonal sheen across card
    c.save();
    c.beginPath();
    c.rect(x + 4, y + 4, cardW - 8, cardH - 8);
    c.clip();
    for (let j = 0; j < 8; j++) {
      const sheen = c.createLinearGradient(x - 50 + j * 60, y, x + 100 + j * 60, y + cardH);
      sheen.addColorStop(0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.5, `rgba(${j%3===0?255:100}, ${j%3===1?255:150}, ${j%3===2?255:200}, 0.18)`);
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sheen;
      c.fillRect(x - 50 + j * 60, y, 200, cardH);
    }
    c.restore();

    // Pokémon artwork
    c.imageSmoothingEnabled = true;
    const imgInset = 30;
    c.drawImage(entry.img, x + imgInset, y + 50, cardW - imgInset * 2, cardH - 140);

    // Name plate
    c.fillStyle = 'rgba(10,6,18,0.85)';
    c.fillRect(x + 16, y + cardH - 80, cardW - 32, 60);
    c.strokeStyle = '#fde047';
    c.lineWidth = 1;
    c.strokeRect(x + 16, y + cardH - 80, cardW - 32, 60);

    c.textAlign = 'center';
    c.fillStyle = '#fff';
    c.font = 'bold 22px "Sora", system-ui';
    const name = entry.member.nickname || entry.pokemon.display;
    c.fillText(name.length > 14 ? name.slice(0, 13) + '…' : name, x + cardW/2, y + cardH - 50);

    c.fillStyle = primary;
    c.font = 'bold 12px "JetBrains Mono", monospace';
    c.fillText(entry.pokemon.types.join(' · ').toUpperCase() + `  ·  BST ${entry.pokemon.bst}`, x + cardW/2, y + cardH - 30);

    if (entry.member.shiny) {
      c.fillStyle = '#fde047';
      c.font = 'bold 24px serif';
      c.textAlign = 'right';
      c.fillText('★', x + cardW - 16, y + 38);
    }
  });

  // Footer
  c.textAlign = 'center';
  c.fillStyle = '#fde047';
  c.font = 'bold 16px "JetBrains Mono", monospace';
  c.fillText(`✦  ${ctx.code}  ·  TRAINERSCODEX  ·  ULTRA RARE  ✦`, W/2, H - 50);
  c.font = '11px "JetBrains Mono", monospace';
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.fillText('independent fan tool · not affiliated', W/2, H - 30);

  return toBlob(canvas);
}

/**
 * BLUEPRINT — technical-drawing aesthetic (2026 trend).
 * - White lines on dark cyan/blue background
 * - Each Pokémon rendered with arrows pointing to type / BST / stats
 * - Measurement labels with brackets
 * - Monospace technical font, "EXHIBIT A" header
 */
async function renderBlueprint(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Deep navy
  c.fillStyle = '#0d2438';
  c.fillRect(0, 0, W, H);

  // Subtle blueprint grid
  c.strokeStyle = 'rgba(255,255,255,0.06)';
  c.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
  // Major grid lines every 200px
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  for (let x = 0; x < W; x += 200) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
  }
  for (let y = 0; y < H; y += 200) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }

  // Top-left title block (technical drawing convention)
  c.strokeStyle = '#7dd3fc';
  c.lineWidth = 2;
  c.strokeRect(40, 40, 480, 120);
  c.fillStyle = '#7dd3fc';
  c.font = 'bold 14px "JetBrains Mono", monospace';
  c.textAlign = 'left';
  c.fillText('EXHIBIT A — SIX-POKÉMON COMPOSITION', 56, 70);
  c.font = '11px "JetBrains Mono", monospace';
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fillText(ellipsize(c, `PROJECT: ${(ctx.teamName || 'untitled').toUpperCase()}`, W - 112), 56, 96);
  c.fillText(`CODE: ${ctx.code}`, 56, 116);
  c.fillText(`SCALE: 1:1   ·   SHEET: 1/1`, 56, 136);

  // Top-right meta block
  c.strokeRect(W - 380, 40, 340, 120);
  c.fillStyle = '#7dd3fc';
  c.font = 'bold 12px "JetBrains Mono", monospace';
  c.fillText('// SPEC SHEET', W - 364, 70);
  c.font = '11px "JetBrains Mono", monospace';
  c.fillStyle = 'rgba(255,255,255,0.7)';
  if (ctx.trainer) {
    c.fillText(`TRAINER: ${ctx.trainer.name}`, W - 364, 96);
    if (ctx.trainer.title) c.fillText(`TITLE: ${ctx.trainer.title}`, W - 364, 116);
    if (ctx.trainer.region) c.fillText(`REGION: ${ctx.trainer.region}`, W - 364, 136);
  } else {
    c.fillText('ANONYMOUS TRAINER', W - 364, 96);
  }

  // 3x2 spec grid with arrows and measurements
  const imgs = await loadTeamImages(ctx.team, 'artwork');
  const cellW = (W - 80) / 3;
  const cellH = 380;
  const startY = 200;

  imgs.forEach((entry, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 40 + col * cellW;
    const y = startY + row * cellH;
    const cx = x + cellW / 2;
    const cy = y + 160;

    // Concentric measurement circles
    c.strokeStyle = 'rgba(125,211,252,0.4)';
    c.lineWidth = 1;
    [60, 100, 140].forEach(r => {
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
    });
    // Inner cross-hairs
    c.beginPath();
    c.moveTo(cx - 150, cy); c.lineTo(cx + 150, cy);
    c.moveTo(cx, cy - 150); c.lineTo(cx, cy + 150);
    c.stroke();

    // Artwork (centered, slightly transparent so blueprint lines show)
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 0.92;
    c.drawImage(entry.img, cx - 110, cy - 110, 220, 220);
    c.globalAlpha = 1;

    // Annotation arrows + labels
    c.strokeStyle = '#7dd3fc';
    c.fillStyle = '#7dd3fc';
    c.lineWidth = 1.2;
    c.font = '10px "JetBrains Mono", monospace';
    c.textAlign = 'left';

    // Label 1: name + dex (top-right of mon)
    const lx1 = cx + 130, ly1 = cy - 80;
    c.beginPath();
    c.moveTo(cx + 90, cy - 60);
    c.lineTo(lx1 - 6, ly1);
    c.stroke();
    drawArrowhead(c, lx1 - 6, ly1, Math.atan2(ly1 - (cy - 60), lx1 - 6 - (cx + 90)));
    c.fillText(`[${padId(entry.pokemon.id)}]`, lx1, ly1 - 4);
    c.fillText(entry.pokemon.display.toUpperCase(), lx1, ly1 + 10);

    // Label 2: types (bottom-left of mon)
    const lx2 = cx - 180, ly2 = cy + 90;
    c.beginPath();
    c.moveTo(cx - 80, cy + 60);
    c.lineTo(lx2 + 100, ly2);
    c.stroke();
    drawArrowhead(c, lx2 + 100, ly2, Math.atan2(ly2 - (cy + 60), (lx2 + 100) - (cx - 80)));
    c.fillText('TYPE:', lx2, ly2 - 4);
    c.fillText(entry.pokemon.types.join(' / ').toUpperCase(), lx2, ly2 + 10);

    // Stats panel below
    c.strokeStyle = 'rgba(125,211,252,0.5)';
    c.strokeRect(x + 20, y + cellH - 110, cellW - 40, 86);
    c.fillStyle = '#7dd3fc';
    c.font = 'bold 11px "JetBrains Mono", monospace';
    c.fillText('STATS', x + 30, y + cellH - 92);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = '11px "JetBrains Mono", monospace';
    const s = entry.pokemon.stats;
    c.fillText(`HP ${s.hp}    ATK ${s.atk}   DEF ${s.def}`, x + 30, y + cellH - 70);
    c.fillText(`SPA ${s.spa}   SPD ${s.spd}   SPE ${s.spe}`, x + 30, y + cellH - 54);
    c.fillStyle = '#fde047';
    c.font = 'bold 12px "JetBrains Mono", monospace';
    c.fillText(`BST ${entry.pokemon.bst}`, x + 30, y + cellH - 34);

    // Dimension bracket on side (measurement convention)
    const bx = x + cellW - 30;
    c.strokeStyle = '#7dd3fc';
    c.beginPath();
    c.moveTo(bx, y + 60); c.lineTo(bx + 8, y + 60);
    c.moveTo(bx + 4, y + 60); c.lineTo(bx + 4, y + cellH - 130);
    c.moveTo(bx, y + cellH - 130); c.lineTo(bx + 8, y + cellH - 130);
    c.stroke();
    c.save();
    c.translate(bx + 16, y + cellH/2 - 20);
    c.rotate(Math.PI / 2);
    c.fillStyle = '#7dd3fc';
    c.font = '10px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    c.fillText(`${entry.pokemon.height}m`, 0, 0);
    c.restore();

    if (entry.member.shiny) {
      c.strokeStyle = '#fde047';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(cx, cy - 130);
      c.lineTo(cx + 6, cy - 118);
      c.lineTo(cx + 18, cy - 118);
      c.lineTo(cx + 9, cy - 110);
      c.lineTo(cx + 12, cy - 98);
      c.lineTo(cx, cy - 105);
      c.lineTo(cx - 12, cy - 98);
      c.lineTo(cx - 9, cy - 110);
      c.lineTo(cx - 18, cy - 118);
      c.lineTo(cx - 6, cy - 118);
      c.closePath();
      c.stroke();
      c.fillStyle = '#fde047';
      c.font = 'bold 9px "JetBrains Mono", monospace';
      c.textAlign = 'center';
      c.fillText('SHINY', cx, cy - 88);
    }
  });

  // Footer bar (drawing notes)
  c.strokeStyle = '#7dd3fc';
  c.strokeRect(40, H - 80, W - 80, 50);
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.font = '11px "JetBrains Mono", monospace';
  c.textAlign = 'left';
  c.fillText('NOTES: composition prepared per analyst spec · types validated against gen 9 chart', 56, H - 60);
  c.textAlign = 'right';
  c.fillText('TRAINERSCODEX // BLUEPRINT', W - 56, H - 60);
  c.textAlign = 'left';
  c.fillStyle = '#7dd3fc';
  c.fillText('REV A — INDEPENDENT FAN TOOL — NOT AFFILIATED', 56, H - 42);

  return toBlob(canvas);
}

function drawArrowhead(c: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  const len = 6;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - len * Math.cos(angle - Math.PI/8), y - len * Math.sin(angle - Math.PI/8));
  c.lineTo(x - len * Math.cos(angle + Math.PI/8), y - len * Math.sin(angle + Math.PI/8));
  c.closePath();
  c.fill();
}

/**
 * GRAINY CINEMA (premium) — soft-focus dreamy, film grain, cinematic letterboxing.
 * - Large feature artwork (1 hero) + 5 smaller supporting
 * - Heavy film grain overlay
 * - Muted teal/orange color palette (Hollywood cinematic standard)
 * - Serif title in upper third, no boxy borders
 */
async function renderGrainyCinema(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Warm dark base
  c.fillStyle = '#1a1410';
  c.fillRect(0, 0, W, H);

  // Cinematic teal-orange split-tone radial
  const tone1 = c.createRadialGradient(W * 0.3, H * 0.3, 100, W * 0.3, H * 0.3, W * 0.9);
  tone1.addColorStop(0, 'rgba(217, 119, 87, 0.5)');
  tone1.addColorStop(0.5, 'rgba(217, 119, 87, 0.15)');
  tone1.addColorStop(1, 'rgba(217, 119, 87, 0)');
  c.fillStyle = tone1;
  c.fillRect(0, 0, W, H);

  const tone2 = c.createRadialGradient(W * 0.75, H * 0.75, 100, W * 0.75, H * 0.75, W * 0.9);
  tone2.addColorStop(0, 'rgba(43, 90, 100, 0.6)');
  tone2.addColorStop(0.5, 'rgba(43, 90, 100, 0.2)');
  tone2.addColorStop(1, 'rgba(43, 90, 100, 0)');
  c.fillStyle = tone2;
  c.fillRect(0, 0, W, H);

  const imgs = await loadTeamImages(ctx.team, 'artwork');

  // Hero (first Pokémon) — huge, soft-focused
  if (imgs.length > 0) {
    const hero = imgs[0];
    const heroSize = 760;
    const hx = W/2 - heroSize/2;
    const hy = 280;

    // Soft glow underneath
    const heroGlow = c.createRadialGradient(W/2, hy + heroSize/2, 50, W/2, hy + heroSize/2, heroSize * 0.7);
    const primary = TYPE_COLORS[hero.pokemon.types[0]];
    heroGlow.addColorStop(0, primary + '88');
    heroGlow.addColorStop(0.4, primary + '33');
    heroGlow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = heroGlow;
    c.fillRect(hx - 60, hy - 60, heroSize + 120, heroSize + 120);

    // Faux soft-focus: draw image multiple times with slight offset and lower alpha
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 0.18;
    for (let i = 1; i <= 4; i++) {
      c.drawImage(hero.img, hx - i * 2, hy - i * 2, heroSize + i * 4, heroSize + i * 4);
    }
    c.globalAlpha = 1;
    c.drawImage(hero.img, hx, hy, heroSize, heroSize);
  }

  // Letterbox bars (top + bottom)
  c.fillStyle = '#0a0604';
  c.fillRect(0, 0, W, 200);
  c.fillRect(0, H - 200, W, 200);

  // Title in upper letterbox — serif, large
  c.textAlign = 'center';
  c.fillStyle = '#f5ead2';
  const cinemaTitle = fitLine(c, ctx.teamName || 'THE TEAM', TITLE_MAX_W, 76,
    px => `bold italic ${px}px "Cormorant Garamond", "Crimson Text", Georgia, serif`, 44);
  c.fillText(cinemaTitle, W/2, 100);

  c.fillStyle = '#d97757';
  c.font = '20px "JetBrains Mono", monospace';
  c.fillText(`— a six-mon composition${ctx.trainer ? ' by ' + ctx.trainer.name : ''} —`, W/2, 140);

  if (ctx.trainer?.motto) {
    c.fillStyle = 'rgba(245,234,210,0.6)';
    c.font = 'italic 16px "Cormorant Garamond", "Crimson Text", Georgia, serif';
    c.fillText(ellipsize(c, `"${ctx.trainer.motto}"`, TITLE_MAX_W), W/2, 170);
  }

  // Supporting 5 mons — small, in lower band
  const supports = imgs.slice(1);
  const supportSize = 130;
  const supportGap = (W - 60 - supportSize * 5) / 4;
  supports.forEach((entry, i) => {
    const x = 30 + i * (supportSize + supportGap);
    const y = H - 200 + 30;

    // Soft glow
    const primary = TYPE_COLORS[entry.pokemon.types[0]];
    const glow = c.createRadialGradient(x + supportSize/2, y + supportSize/2, 10, x + supportSize/2, y + supportSize/2, supportSize * 0.7);
    glow.addColorStop(0, primary + '66');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow;
    c.fillRect(x - 20, y - 20, supportSize + 40, supportSize + 40);

    c.globalAlpha = 0.2;
    c.drawImage(entry.img, x - 1, y - 1, supportSize + 2, supportSize + 2);
    c.globalAlpha = 1;
    c.drawImage(entry.img, x, y, supportSize, supportSize);

    // Small label below
    c.fillStyle = 'rgba(245,234,210,0.75)';
    c.font = 'italic 13px "Cormorant Garamond", Georgia, serif';
    c.textAlign = 'center';
    const name = entry.member.nickname || entry.pokemon.display;
    c.fillText(name.length > 13 ? name.slice(0, 12) + '…' : name, x + supportSize/2, y + supportSize + 18);
  });

  // Film grain overlay — random noise across whole canvas
  const imgData = c.getImageData(0, 0, W, H);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 38;
    data[i] = Math.max(0, Math.min(255, data[i] + grain));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain));
  }
  c.putImageData(imgData, 0, 0);

  // Vignette
  const vignette = c.createRadialGradient(W/2, H/2, W * 0.4, W/2, H/2, W * 0.85);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
  c.fillStyle = vignette;
  c.fillRect(0, 0, W, H);

  // Footer credit (cinematic title-card style)
  c.fillStyle = 'rgba(245,234,210,0.55)';
  c.font = '12px "JetBrains Mono", monospace';
  c.textAlign = 'center';
  c.fillText(`A TRAINERSCODEX FILM   ·   ${ctx.code}   ·   ${new Date().getFullYear()}`, W/2, H - 30);

  return toBlob(canvas);
}

/**
 * TYPE COLLAGE — DIY zine / cut-paper aesthetic (Kittl 2026 trend).
 * - Off-white paper background with subtle paper texture
 * - Each Pokémon as a "cutout" with a rough offset shadow and a tape strip
 * - Mixed typography: serif headlines, marker scribbles, monospace tags
 * - Overlapping arrangement, slight rotation per mon
 */
async function renderTypeCollage(ctx: PosterContext): Promise<Blob> {
  const { canvas, ctx: c } = setupCanvas();
  const W = WIDTH, H = HEIGHT;

  // Paper background
  c.fillStyle = '#f0e8d6';
  c.fillRect(0, 0, W, H);

  // Subtle paper grain
  for (let i = 0; i < 6000; i++) {
    c.fillStyle = `rgba(${100 + Math.random() * 30}, ${85 + Math.random() * 30}, ${60 + Math.random() * 30}, ${0.05 + Math.random() * 0.04})`;
    c.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random(), 1 + Math.random());
  }

  // Color blocks scattered as "torn paper"
  const blockColors = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#e9c46a', '#7209b7'];
  for (let i = 0; i < 12; i++) {
    c.save();
    c.translate(Math.random() * W, Math.random() * H);
    c.rotate((Math.random() - 0.5) * 0.6);
    c.globalAlpha = 0.15 + Math.random() * 0.15;
    c.fillStyle = blockColors[i % blockColors.length];
    c.fillRect(-60 - Math.random() * 80, -30 - Math.random() * 30, 120 + Math.random() * 160, 60 + Math.random() * 60);
    c.restore();
  }
  c.globalAlpha = 1;

  // Big serif headline (top-left, slightly rotated)
  c.save();
  c.translate(60, 140);
  c.rotate(-0.03);
  c.fillStyle = '#1a1410';
  c.font = 'bold italic 86px "Cormorant Garamond", "Crimson Text", Georgia, serif';
  c.textAlign = 'left';
  c.fillText('the', 0, 0);
  c.fillStyle = '#e63946';
  c.fillText('TEAM.', 110, 0);
  c.restore();

  // Subtitle
  c.save();
  c.translate(80, 200);
  c.rotate(0.01);
  c.fillStyle = '#264653';
  c.font = 'bold 24px "JetBrains Mono", monospace';
  c.textAlign = 'left';
  c.fillText(ellipsize(c, '// ' + (ctx.teamName || 'untitled six').toUpperCase(), W - 160), 0, 0);
  c.restore();

  // Trainer signature scribble
  if (ctx.trainer) {
    c.save();
    c.translate(W - 280, 130);
    c.rotate(-0.05);
    c.fillStyle = '#1a1410';
    c.font = 'italic 22px "Caveat", "Cormorant Garamond", cursive';
    c.textAlign = 'left';
    c.fillText('— ' + ctx.trainer.name, 0, 0);
    if (ctx.trainer.title) {
      c.font = '14px "JetBrains Mono", monospace';
      c.fillStyle = '#7209b7';
      c.fillText(ctx.trainer.title.toUpperCase(), 0, 22);
    }
    c.restore();
  }

  // Mons arranged as cutouts (not a grid — collage-style with overlap)
  const imgs = await loadTeamImages(ctx.team, 'artwork');
  // Predefined positions roughly forming a magazine-spread layout
  const positions: Array<{ x: number; y: number; r: number; size: number; tapeAngle: number }> = [
    { x: 130, y: 320, r: -0.06,  size: 360, tapeAngle: 0.4 },
    { x: 580, y: 280, r:  0.08,  size: 320, tapeAngle: -0.3 },
    { x: 300, y: 580, r: -0.04,  size: 280, tapeAngle: 0.2 },
    { x: 680, y: 600, r:  0.05,  size: 300, tapeAngle: -0.5 },
    { x: 100, y: 820, r:  0.07,  size: 260, tapeAngle: 0.3 },
    { x: 600, y: 920, r: -0.10,  size: 280, tapeAngle: -0.4 },
  ];

  imgs.forEach((entry, i) => {
    const pos = positions[i % positions.length];
    const primary = TYPE_COLORS[entry.pokemon.types[0]];

    c.save();
    c.translate(pos.x + pos.size/2, pos.y + pos.size/2);
    c.rotate(pos.r);
    c.translate(-pos.size/2, -pos.size/2);

    // Rough paper backing (color block matching primary type)
    c.fillStyle = primary + 'cc';
    c.fillRect(-12, -12, pos.size + 24, pos.size + 24);

    // Cutout shadow (offset)
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(6, 6, pos.size, pos.size);

    // White paper backing for the image
    c.fillStyle = '#fffaf0';
    c.fillRect(0, 0, pos.size, pos.size);

    // Image
    c.imageSmoothingEnabled = true;
    c.drawImage(entry.img, 8, 8, pos.size - 16, pos.size - 16);

    // Marker scribble for name
    c.fillStyle = '#1a1410';
    c.font = 'bold italic 26px "Caveat", "Cormorant Garamond", cursive';
    c.textAlign = 'left';
    const name = entry.member.nickname || entry.pokemon.display;
    c.fillText(name, 12, pos.size + 32);

    // Type tag (monospace)
    c.fillStyle = primary;
    c.font = 'bold 11px "JetBrains Mono", monospace';
    c.fillText(entry.pokemon.types.join(' / ').toUpperCase() + ' · #' + padId(entry.pokemon.id), 12, pos.size + 50);

    c.restore();

    // Tape strip (always drawn on top, in its own rotation frame)
    c.save();
    c.translate(pos.x + pos.size/2, pos.y + 10);
    c.rotate(pos.tapeAngle);
    c.fillStyle = 'rgba(255, 247, 200, 0.7)';
    c.fillRect(-50, -12, 100, 24);
    // Tape edge lines
    c.strokeStyle = 'rgba(0,0,0,0.1)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-50, -12); c.lineTo(50, -12);
    c.moveTo(-50, 12); c.lineTo(50, 12);
    c.stroke();
    c.restore();

    // Shiny ribbon
    if (entry.member.shiny) {
      c.save();
      c.translate(pos.x + pos.size - 20, pos.y - 8);
      c.rotate(pos.r + 0.25);
      c.fillStyle = '#fde047';
      c.fillRect(-22, -10, 44, 20);
      c.fillStyle = '#1a1410';
      c.font = 'bold 11px "JetBrains Mono", monospace';
      c.textAlign = 'center';
      c.fillText('★ SHINY', 0, 4);
      c.restore();
    }
  });

  // Cut-out footer
  c.fillStyle = '#1a1410';
  c.font = 'bold 14px "JetBrains Mono", monospace';
  c.textAlign = 'left';
  c.fillText('// ' + ctx.code, 60, H - 50);
  c.textAlign = 'right';
  c.fillStyle = '#e63946';
  c.font = 'italic 16px "Cormorant Garamond", Georgia, serif';
  c.fillText('a trainerscodex zine', W - 60, H - 50);

  return toBlob(canvas);
}


export async function renderPoster(ctx: PosterContext): Promise<Blob> {
  switch (ctx.style) {
    case 'pixel-crt':       return renderCRTManifest(ctx);
    case 'pixel-grid':      return renderPixelGrid(ctx);
    case 'manifest':        return renderEditorial(ctx);
    case 'gameboy-mono':    return renderGameBoy(ctx);
    case 'arcade-cabinet':  return renderArcadeCabinet(ctx);
    case 'polaroid':        return renderPolaroid(ctx);
    case 'sticker-sheet':   return renderStickerSheet(ctx);
    case 'tcg-card':        return renderTCGCardSheet(ctx);
    // v5 new styles
    case 'holo-foil':       return renderHoloFoil(ctx);
    case 'blueprint':       return renderBlueprint(ctx);
    case 'grainy-cinema':   return renderGrainyCinema(ctx);
    case 'type-collage':    return renderTypeCollage(ctx);
    default:                return renderCRTManifest(ctx);
  }
}
