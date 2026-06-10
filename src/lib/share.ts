// Native share helpers. Prefer the Web Share API so mobile users can one-tap a
// generated image straight into Instagram / TikTok / Messages / etc. — the core
// viral loop. Everything degrades gracefully: if file sharing isn't supported
// we report 'unsupported' and the caller falls back to download/copy. Must be
// called from a user gesture (a click handler) per the Web Share API contract.

export type ShareResult = 'shared' | 'unsupported' | 'cancelled';

export function canShareFiles(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function';
}

export function canShareLink(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export interface ShareImageOpts {
  blob: Blob;
  filename: string;
  title?: string;
  text?: string;
  url?: string;
}

export async function shareImage(opts: ShareImageOpts): Promise<ShareResult> {
  const { blob, filename, title, text, url } = opts;
  if (!canShareFiles()) return 'unsupported';
  const file = new File([blob], filename, { type: blob.type || 'image/png' });
  const data: ShareData = { files: [file], title, text, url };
  if (!navigator.canShare(data)) return 'unsupported';
  try {
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

export async function shareLink(opts: { title?: string; text?: string; url: string }): Promise<ShareResult> {
  if (!canShareLink()) return 'unsupported';
  try {
    await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

// Best-effort fetch of a (possibly remote) image URL into a Blob so it can be
// shared as a file. Returns null when the fetch is blocked (e.g. cross-origin
// without CORS) — the caller should then fall back to sharing the URL/text.
export async function urlToBlob(url: string): Promise<Blob | null> {
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) return null;
    return await resp.blob();
  } catch {
    return null;
  }
}
