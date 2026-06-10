// ============================================================
// Free-text style-prompt sanitization
// ============================================================
// Users may type their own style direction and/or drop in a "favorite card" as
// a style reference. Both are HIGH RISK because the output can be printed and
// sold. We never let caller text drive a literal reproduction: brand / franchise
// / iconic-character tokens and copy-intent phrases are stripped server-side,
// and whatever survives is framed downstream as a *style hint only* (mood,
// palette, finish), with the originality guard as the hard backstop. This is a
// best-effort denylist, not exhaustive recognition — the guard, not this list,
// is what guarantees transformative output.
//
// Kept import-free in its own module so it can be unit-tested directly under
// `node --test` (native TS type-stripping) without dragging in the Worker
// runtime graph.

// Franchise / brand / publisher marks and a sampling of the most-typed iconic
// character names. Matched case-insensitively on word boundaries.
const BLOCKED_BRAND_TERMS = [
  'pokemon', 'pokémon', 'pokmon', 'nintendo', 'game freak', 'gamefreak',
  'the pokemon company', 'tpci', 'creatures inc',
  'poké ball', 'pokeball', 'poke ball', 'pokedex', 'pokédex',
  'pikachu', 'charizard', 'mewtwo', 'mew', 'eevee', 'bulbasaur', 'squirtle',
  'charmander', 'lucario', 'gengar', 'snorlax', 'rayquaza', 'greninja',
  'gardevoir', 'umbreon', 'sylveon', 'gyarados', 'dragonite', 'lugia', 'ho-oh',
  'yu-gi-oh', 'yugioh', 'magic the gathering', 'digimon', 'disney', 'marvel',
  'dc comics', 'star wars', 'nintendo switch',
];

// Copy-intent phrases — explicit requests to reproduce, forge, or match an
// official/real asset. Stripped outright.
const BLOCKED_INTENT_TERMS = [
  'official', 'authentic', 'real card', 'genuine', 'exact copy', 'exact replica',
  'replica', 'identical to', 'one to one', '1:1', 'trademark', 'copyright',
  'logo', 'wordmark', 'trade dress', 'energy symbol', 'set symbol', 'rarity symbol',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface SanitizedPrompt {
  text: string;          // cleaned style hint (may be empty)
  removed: string[];     // distinct blocked terms that were stripped
}

export function sanitizeStylePrompt(raw: string | null | undefined): SanitizedPrompt {
  if (!raw) return { text: '', removed: [] };
  let text = String(raw).slice(0, 400);
  const removed: string[] = [];
  for (const term of [...BLOCKED_BRAND_TERMS, ...BLOCKED_INTENT_TERMS]) {
    const re = new RegExp(`\\b${escapeRegex(term)}\\b`, 'ig');
    if (re.test(text)) {
      removed.push(term);
      text = text.replace(re, ' ');
    }
  }
  // Drop any leftover trademark/copyright glyphs and collapse whitespace.
  text = text.replace(/[™®©]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 280);
  return { text, removed };
}
