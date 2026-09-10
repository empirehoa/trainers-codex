// The 9:16 "card build" video — the Legend Card assembling itself.
//
// ── Why this exists ──────────────────────────────────────────────────────
// The Aug-7 strategy doc ranked this P0 on evidence, and a second sweep two
// weeks later reached the same conclusion from a different direction:
//
//   * The summer's biggest Pokémon virality event was driven entirely by short
//     vertical video of a TRANSFORMATION IN PROGRESS — one keypress walking a
//     ladder from flat 1996 Kanto to a lit 3D world. Every viral clip was that
//     same two-second shot, and because it was a *ladder*, every creator's clip
//     differed.
//   * Pack-opening simulators — the same shape as us, free and browser-only, one
//     reporting 165M packs opened — are built entirely on the moment of not
//     knowing. The reveal is the product.
//
// A still PNG of a finished thing has neither property. This gives the Legend
// Card a build: numbers count up, badges snap in, the six resolve out of the
// dark. It loops, so it reads as a clip rather than a screenshot.
//
// ── Constraints ──────────────────────────────────────────────────────────
// Client-side only, no encoder dependency, no network: `canvas.captureStream()`
// into `MediaRecorder`. That means the output container is whatever the browser
// gives us (WebM/VP9 nearly everywhere, MP4 on some Safari builds), so the
// caller must read `mimeType` off the result rather than assuming.
//
// Feature detection is real, not optimistic. `MediaRecorder` exists in every
// current browser but `captureStream` does not, some builds expose the
// constructor and then reject every codec, and iOS support has historically
// been partial — so `canRecordVideo()` probes the actual pipeline and the UI
// degrades to the PNG path when it fails.

import { spriteUrl } from '@/lib/pokemon';
import { TYPE_COLORS } from '@/lib/constants';
import { monEpithet } from './content';
import { displayLink } from './deeplink';
import { resolveRank, rosterRarity } from './ranks';
import { fallbackSilhouette, loadImg, roundRect, silhouetteFrom } from './legend-card';
import { translate, type Locale, type Vars } from '@/i18n/strings';
import { POKEMON_BY_ID } from '@/lib/pokemon';
import type { JourneyRun } from './types';

/** Vertical, the format every short-video surface wants. */
export const VIDEO_W = 1080;
export const VIDEO_H = 1920;

/** 7 seconds at 30fps — long enough to read, short enough to loop. */
export const VIDEO_FPS = 30;
export const VIDEO_SECONDS = 7;
export const VIDEO_FRAMES = VIDEO_FPS * VIDEO_SECONDS;

/**
 * Codecs to try, best first. WebM/VP9 is the widest-support high-quality
 * option; the MP4 entry is for Safari builds that expose MediaRecorder with an
 * H.264 encoder and reject WebM entirely.
 */
const CODECS = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

/** First supported codec, or null when none is. */
export function pickCodec(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of CODECS) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // Some builds throw rather than returning false. Treat as unsupported.
    }
  }
  return null;
}

/**
 * Can this browser actually produce a clip?
 *
 * Probes the whole pipeline, because each piece fails independently: the
 * constructor can exist without `captureStream`, and a codec can be reported
 * supported and still fail to start.
 */
export function canRecordVideo(): boolean {
  if (typeof document === 'undefined') return false;
  if (pickCodec() === null) return false;
  try {
    const probe = document.createElement('canvas');
    probe.width = 2;
    probe.height = 2;
    return typeof (probe as HTMLCanvasElement & {
      captureStream?: unknown;
    }).captureStream === 'function';
  } catch {
    return false;
  }
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Progress of one stage of the build, 0..1.
 *
 * Stages overlap deliberately — a hard cut between them reads as a slideshow,
 * and the whole point is that the card assembles.
 */
function stage(frame: number, startPct: number, endPct: number): number {
  const t = frame / VIDEO_FRAMES;
  return clamp01(ease(clamp01((t - startPct) / Math.max(0.0001, endPct - startPct))));
}

export interface CardVideoOptions {
  run: JourneyRun;
  locale?: Locale;
  origin?: string;
  /** Called with 0..1 as frames render, for a progress bar. */
  onProgress?: (pct: number) => void;
}

export interface CardVideoResult {
  blob: Blob;
  mimeType: string;
  /** File extension matching the container the browser actually produced. */
  extension: 'webm' | 'mp4';
}

interface Figure {
  img: HTMLCanvasElement;
  colour: string;
}

/** Silhouettes for the six, resolved up front so the timeline never stalls. */
async function loadFigures(run: JourneyRun, size: number): Promise<Figure[]> {
  return Promise.all(run.roster.slice(0, 6).map(async entry => {
    const colour = TYPE_COLORS[entry.types[0] ?? 'normal'] ?? '#888';
    try {
      const img = await loadImg(spriteUrl(entry.id, entry.shiny ? 'pixel-shiny' : 'pixel-default'));
      return { img: silhouetteFrom(img, size, colour, colour), colour };
    } catch {
      // A sprite mirror 403 or a hung request must not cost the whole clip —
      // the same fallback the still card uses.
      return { img: fallbackSilhouette(size, colour, colour), colour };
    }
  }));
}

/**
 * Render the animated card and return the encoded clip.
 *
 * Frames are driven by `requestAnimationFrame` rather than a fixed timer so the
 * recorder samples a canvas that is genuinely repainting; a `setInterval` loop
 * can outrun compositing and produce dropped or duplicated frames.
 */
export async function renderCardVideo(opts: CardVideoOptions): Promise<CardVideoResult> {
  const { run, origin, onProgress } = opts;
  const locale: Locale = opts.locale ?? 'en';
  const mimeType = pickCodec();
  if (!mimeType) throw new Error('card-video: no supported codec');

  const t = (key: string, vars?: Vars) => translate(key, locale, vars);

  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('card-video: no 2d context');
  const c: CanvasRenderingContext2D = ctx;

  const figSize = 210;
  const figures = await loadFigures(run, figSize);

  const rank = resolveRank(run.score);
  const rarity = rosterRarity({
    legendaryCount: run.roster.filter(m => POKEMON_BY_ID[m.id]?.legendary || POKEMON_BY_ID[m.id]?.mythical).length,
    shinyCount: run.roster.filter(m => m.shiny).length,
    eventCount: run.roster.filter(m => m.origin === 'event').length,
    evolvedCount: run.roster.reduce((n, m) => n + (m.evolved ?? 0), 0),
    archetype: run.setup.archetype,
  });

  const primary = '#f4ae3c';
  const dim = 'rgba(255,255,255,0.55)';
  const badgeTotal = 8;

  function drawFrame(frame: number) {
    // ---------- ground ----------
    c.fillStyle = '#0b0b0f';
    c.fillRect(0, 0, VIDEO_W, VIDEO_H);
    const glow = c.createRadialGradient(VIDEO_W / 2, VIDEO_H * 0.34, 40, VIDEO_W / 2, VIDEO_H * 0.34, VIDEO_W * 0.9);
    glow.addColorStop(0, 'rgba(244,174,60,0.16)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, VIDEO_W, VIDEO_H);

    c.textAlign = 'center';

    // ---------- 1. the trainer, fading up ----------
    const a1 = stage(frame, 0.00, 0.14);
    c.globalAlpha = a1;
    c.fillStyle = dim;
    c.font = '30px "JetBrains Mono", monospace';
    c.fillText(t('journey.card.kicker'), VIDEO_W / 2, 210);
    c.fillStyle = '#fff';
    c.font = 'bold 84px "Sora", system-ui';
    c.fillText(run.setup.trainerName.toUpperCase(), VIDEO_W / 2, 300);
    c.globalAlpha = 1;

    // ---------- 2. badges snapping in, one at a time ----------
    // The ladder property: each badge lands on its own beat, so a clip cut at
    // any moment shows a different count. That is what made the voxel-mod clips
    // all differ from each other.
    const a2 = stage(frame, 0.10, 0.40);
    const earned = Math.min(run.stats.badges, badgeTotal);
    const bw = 84, bgap = 14;
    const bx0 = VIDEO_W / 2 - (badgeTotal * bw + (badgeTotal - 1) * bgap) / 2;
    for (let i = 0; i < badgeTotal; i++) {
      const x = bx0 + i * (bw + bgap);
      c.strokeStyle = 'rgba(255,255,255,0.14)';
      c.lineWidth = 2;
      roundRect(c, x, 380, bw, bw, 10);
      c.stroke();
      if (i < earned) {
        // Per-badge progress, so they arrive in sequence rather than together.
        const p = clamp01((a2 * earned) - i);
        if (p > 0) {
          const s = 0.6 + 0.4 * p;
          c.save();
          c.globalAlpha = p;
          c.translate(x + bw / 2, 380 + bw / 2);
          c.scale(s, s);
          c.fillStyle = primary;
          roundRect(c, -bw / 2, -bw / 2, bw, bw, 10);
          c.fill();
          c.restore();
        }
      }
    }

    // ---------- 3. the six resolving out of the dark ----------
    const a3 = stage(frame, 0.24, 0.62);
    const cols = 3;
    const gap = 34;
    const gridW = cols * figSize + (cols - 1) * gap;
    const gx0 = VIDEO_W / 2 - gridW / 2;
    figures.forEach((fig, i) => {
      const p = clamp01((a3 * figures.length) - i);
      if (p <= 0) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gx0 + col * (figSize + gap);
      const y = 540 + row * (figSize + gap + 44);
      c.save();
      c.globalAlpha = p;
      // Rises into place — motion is what separates a build from a fade.
      c.translate(0, (1 - p) * 46);
      c.drawImage(fig.img, x, y);
      c.globalAlpha = p * 0.85;
      c.fillStyle = dim;
      c.font = '22px "JetBrains Mono", monospace';
      c.fillText(monEpithet(run.roster[i].id), x + figSize / 2, y + figSize + 32);
      c.restore();
    });
    c.globalAlpha = 1;

    // ---------- 4. the score counting up ----------
    // The single most-watched beat in this format: a number climbing is the
    // reason to keep watching to the end.
    const a4 = stage(frame, 0.52, 0.82);
    const shown = Math.round(run.score * a4);
    c.fillStyle = dim;
    c.font = '28px "JetBrains Mono", monospace';
    c.fillText(t('journey.card.careerScore'), VIDEO_W / 2, 1330);
    c.fillStyle = primary;
    c.font = 'bold 150px "Sora", system-ui';
    c.fillText(String(shown), VIDEO_W / 2, 1470);

    // ---------- 5. the verdict + rank resolving last ----------
    const a5 = stage(frame, 0.72, 0.94);
    c.globalAlpha = a5;
    c.fillStyle = '#fff';
    c.font = 'bold 62px "Sora", system-ui';
    c.fillText(
      t(run.verdict.titleKey, { region: String(run.chapters[0]?.vars.region ?? '').toUpperCase() }),
      VIDEO_W / 2, 1590,
    );
    c.fillStyle = primary;
    c.font = 'bold 40px "Sora", system-ui';
    c.fillText(t(rank.nameKey), VIDEO_W / 2, 1660);
    c.fillStyle = dim;
    c.font = '26px "JetBrains Mono", monospace';
    c.fillText(
      `${t('journey.rank.percentile', { pct: 100 - rank.percentile })}  ·  ${t('journey.rank.rosterRarity', { pct: rarity })}`,
      VIDEO_W / 2, 1706,
    );
    c.globalAlpha = 1;

    // ---------- 6. the playable link, held for the whole tail ----------
    // The clip is an acquisition asset or it is nothing, so the link is on
    // screen long enough to be read and typed.
    const a6 = stage(frame, 0.80, 0.96);
    c.globalAlpha = a6;
    c.fillStyle = primary;
    c.font = 'bold 30px "JetBrains Mono", monospace';
    c.fillText(displayLink(run.setup.seed, origin), VIDEO_W / 2, 1810);
    c.fillStyle = dim;
    c.font = '22px "JetBrains Mono", monospace';
    c.fillText(t('journey.card.disclaimer'), VIDEO_W / 2, 1862);
    c.globalAlpha = 1;
  }

  // ---------- record ----------
  const stream = (canvas as HTMLCanvasElement & {
    captureStream: (fps?: number) => MediaStream;
  }).captureStream(VIDEO_FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('card-video: recorder failed'));
  });

  // Paint frame 0 before starting, so the first sampled frame is never blank.
  drawFrame(0);
  recorder.start();

  await new Promise<void>(resolve => {
    let frame = 0;
    const step = () => {
      drawFrame(frame);
      onProgress?.(frame / VIDEO_FRAMES);
      frame++;
      if (frame > VIDEO_FRAMES) { resolve(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  recorder.stop();
  await done;
  for (const track of stream.getTracks()) track.stop();

  const blob = new Blob(chunks, { type: mimeType });
  return {
    blob,
    mimeType,
    extension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm',
  };
}
