// Paste-URL import — turn a shared paste LINK into the paste TEXT.
//
// Every serious 2026 builder accepts pokepast.es / PokeBin / Showdown-teams
// URLs, not just raw text (crob.at built a whole product on it). Users share
// links, not walls of text — meeting them there removes the single biggest
// import friction.
//
// Design constraints:
//   * Zero dependencies; must work from the single-file bundle.
//   * These are third-party hosts with no CORS guarantees. Every candidate is
//     attempted and failure degrades to a human-readable instruction ("open the
//     link and copy the text"), never a broken import.
//   * The URL→candidates mapping is pure and unit-tested; only `fetchPasteText`
//     touches the network.

/** Hosts we recognize as paste sources, with their raw-text URL shapes. */
export function pasteCandidateUrls(input: string): string[] {
  const trimmed = input.trim();
  // A paste body is multi-line; a link is one line. Refuse anything that isn't
  // a single plausible http(s) URL so ordinary pastes never hit the network.
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return [];

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return [];
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.replace(/\/+$/, ''); // strip trailing slashes

  // pokepast.es/<id> → /<id>/raw (plain text) with /<id>/json as a fallback
  // (the JSON body carries the paste under a `paste` key).
  if (host === 'pokepast.es' && /^\/[0-9a-f]+$/i.test(path)) {
    return [`https://pokepast.es${path}/raw`, `https://pokepast.es${path}/json`];
  }
  // Already a raw/json link — take it as-is.
  if (host === 'pokepast.es' && /^\/[0-9a-f]+\/(raw|json)$/i.test(path)) {
    return [`https://pokepast.es${path}`];
  }
  // pokebin.com/<id> — raw shape has varied across versions; try both.
  if (host === 'pokebin.com' && path.length > 1 && !path.includes('/', 1)) {
    return [`https://pokebin.com${path}/raw`, `https://pokebin.com/raw${path}`];
  }
  // teams.pokemonshowdown.com/<slug> → append /raw (their share pages expose it).
  if (host === 'teams.pokemonshowdown.com' && path.length > 1) {
    return [`https://teams.pokemonshowdown.com${path}/raw`, trimmed];
  }
  return [];
}

/** True when the input is a link we know how to resolve. */
export function isPasteUrl(input: string): boolean {
  return pasteCandidateUrls(input).length > 0;
}

/** Does a fetched body look like Showdown paste text rather than an error page? */
export function looksLikePaste(text: string): boolean {
  // Cheap structural sniff: a move line ("- Protect") or a set header
  // ("X @ Item" / "Ability:") appears in every real paste; HTML error pages
  // have neither. Keep it permissive — parsePokePaste is the real validator.
  if (!text || /<!doctype html|<html[\s>]/i.test(text.slice(0, 256))) return false;
  return /^\s*-\s+\S|@|Ability\s*:/m.test(text);
}

/**
 * Resolve a paste URL to its text. Tries each candidate in order; JSON bodies
 * are unwrapped ({ paste: "..." }). Returns null when nothing worked — the
 * caller owns the messaging.
 */
export async function fetchPasteText(
  input: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  for (const candidate of pasteCandidateUrls(input)) {
    try {
      const res = await fetcher(candidate, { mode: 'cors', redirect: 'follow' });
      if (!res.ok) continue;
      const body = await res.text();
      if (candidate.endsWith('/json')) {
        try {
          const parsed: unknown = JSON.parse(body);
          const paste = (parsed as { paste?: unknown })?.paste;
          if (typeof paste === 'string' && looksLikePaste(paste)) return paste;
        } catch { /* fall through to next candidate */ }
        continue;
      }
      if (looksLikePaste(body)) return body;
    } catch {
      // Network/CORS failure — try the next shape.
    }
  }
  return null;
}
