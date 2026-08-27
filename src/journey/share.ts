// Sharing the Legend Card.
//
// Three tiers, each one tap, degrading cleanly:
//   1. Web Share with the PNG attached — the only path that reaches Instagram
//      Stories / TikTok directly from mobile web.
//   2. Copy the image to the clipboard — desktop Chrome/Edge/Safari.
//   3. Download the PNG — always available.
//
// ── iOS Safari constraints, which drive this whole module's shape ─────────
// * `navigator.share({ files })` throws unless `navigator.canShare({ files })`
//   returned true for the SAME payload first. Feature-detecting `navigator.share`
//   alone is not enough — file sharing is a separate capability.
// * The call must happen inside a user-gesture task. An `await` that resolves
//   from a network round-trip or a canvas render breaks the gesture chain and
//   the share silently fails. So the blob is rendered ahead of time and held by
//   the caller; `shareLegendCard` only ever awaits `navigator.share` itself.

export type ShareOutcome =
  | { ok: true; method: 'webshare' | 'copy' | 'download' }
  | { ok: false; method: 'webshare' | 'copy' | 'download'; reason: 'unsupported' | 'aborted' | 'failed' };

// `share` and `canShare` are declared non-optional on lib.dom's Navigator, but
// they are genuinely absent on desktop Firefox and older Safari — so these are
// re-typed as optional for honest runtime guarding rather than trusting the lib.
type MaybeShareNavigator = Omit<Navigator, 'share' | 'canShare'> & {
  share?: (data?: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
};

function nav(): MaybeShareNavigator | null {
  return typeof navigator === 'undefined' ? null : (navigator as MaybeShareNavigator);
}

export function fileFromBlob(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type || 'image/png' });
}

/**
 * Can this browser share THIS payload? Must be called with the same file the
 * share will use — capability varies by file type, not just by API presence.
 */
export function canShareFile(file: File): boolean {
  const n = nav();
  if (!n?.share || !n.canShare) return false;
  try {
    return n.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Text-only share support, used when the image can't be attached. */
export function canShareText(): boolean {
  const n = nav();
  if (!n?.share) return false;
  if (!n.canShare) return true; // older Android Chrome: share exists, canShare doesn't
  try {
    return n.canShare({ text: 'probe' });
  } catch {
    return false;
  }
}

/**
 * Attempt a Web Share with the card attached.
 *
 * MUST be called synchronously from a click/tap handler with an already-rendered
 * blob. Returns `unsupported` rather than throwing so the caller can fall
 * through to the next tier, and distinguishes `aborted` (the user closed the
 * share sheet — not an error, don't show a failure toast) from `failed`.
 */
export async function shareLegendCard(opts: {
  file: File;
  text: string;
  title: string;
  url?: string;
}): Promise<ShareOutcome> {
  const n = nav();
  if (!n?.share) return { ok: false, method: 'webshare', reason: 'unsupported' };

  const withFile = canShareFile(opts.file);
  const payload = withFile
    ? { files: [opts.file], text: opts.text, title: opts.title }
    : { text: opts.text, title: opts.title, url: opts.url };

  if (!withFile && !canShareText()) {
    return { ok: false, method: 'webshare', reason: 'unsupported' };
  }

  try {
    await n.share(payload);
    return { ok: true, method: 'webshare' };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'AbortError') return { ok: false, method: 'webshare', reason: 'aborted' };
    return { ok: false, method: 'webshare', reason: 'failed' };
  }
}

/** Copy the PNG to the clipboard. Chromium and Safari 13.1+; not Firefox. */
export async function copyImageToClipboard(blob: Blob): Promise<ShareOutcome> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      return { ok: false, method: 'copy', reason: 'unsupported' };
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return { ok: true, method: 'copy' };
  } catch {
    return { ok: false, method: 'copy', reason: 'failed' };
  }
}

export async function copyTextToClipboard(text: string): Promise<ShareOutcome> {
  try {
    if (!navigator.clipboard?.writeText) {
      return { ok: false, method: 'copy', reason: 'unsupported' };
    }
    await navigator.clipboard.writeText(text);
    return { ok: true, method: 'copy' };
  } catch {
    return { ok: false, method: 'copy', reason: 'failed' };
  }
}

/**
 * Download the PNG. The universal fallback — no capability gate, because an
 * anchor with a `download` attribute works everywhere the app runs.
 */
export function downloadBlob(blob: Blob, filename: string): ShareOutcome {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next frame — revoking synchronously can cancel the
    // download in Safari before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, method: 'download' };
  } catch {
    return { ok: false, method: 'download', reason: 'failed' };
  }
}

/** Filename for a run's card. Safe on every filesystem we care about. */
export function legendCardFilename(trainerName: string, seed: number): string {
  const slug = trainerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trainer';
  return `${slug}-legend-${seed}.png`;
}

// ============================================================
// EMOJI SHARE SUMMARY
// ============================================================
//
// Wordle taught the whole category one lesson: a share that pastes as a compact,
// spoiler-free emoji strip travels through Discord/X/iMessage with zero friction,
// and the *shape* of the result is the hook — not the details. Squirdle's
// 🟩🟥🟨 key and Immaculate Grid's rarity line are the same move. This is the
// text half of the Legend Card share: the PNG wins Instagram, the strip wins
// chat. Deliberately reveals nothing about the day's seed content (encounters,
// routes, story beats) so it never spoils the shared daily.

/** Max badge slots drawn on the strip — one gym circuit. */
const BADGE_SLOTS = 8;

/**
 * Pure, deterministic emoji summary of a finished run.
 *
 * Line 1: badge progress as a filled/empty strip (the "grid").
 * Line 2: career superlatives, only the ones that happened (no zero-noise).
 */
export function buildEmojiSummary(run: {
  stats: {
    badges: number;
    titles: number;
    shinies: number;
    peakRank: number;
    wins: number;
    losses: number;
  };
  chapterCount: number;
  score: number;
}): string {
  const { badges, titles, shinies, peakRank, wins, losses } = run.stats;
  const filled = Math.max(0, Math.min(badges, BADGE_SLOTS));
  const strip = '🏅'.repeat(filled) + '◽'.repeat(BADGE_SLOTS - filled);

  const parts: string[] = [];
  if (titles > 0) parts.push(`🏆×${titles}`);
  if (shinies > 0) parts.push(`✨×${shinies}`);
  if (peakRank > 0 && peakRank < 999) parts.push(`📈#${peakRank}`);
  const total = wins + losses;
  if (total > 0) parts.push(`⚔️${Math.round((wins / total) * 100)}%`);
  parts.push(`🎂${run.chapterCount}yr`);

  return `${strip}\n${parts.join(' · ')}`;
}

/**
 * The share line, with the rank word in it.
 *
 * `buildEmojiSummary` is all glyphs and numbers, which travels well but says
 * nothing out loud. A rank is the part a person repeats — "I hit Champion" —
 * so it gets its own line above the strip.
 */
export function buildShareText(run: {
  stats: { badges: number; titles: number; shinies: number; peakRank: number; wins: number; losses: number };
  chapterCount: number;
  score: number;
}, opts: { rankName: string; percentile: number }): string {
  return `${opts.rankName} · ${run.score}/999 · top ${100 - opts.percentile}%\n${buildEmojiSummary(run)}`;
}
