// AI image generation routes for Trainer's Codex v6.
//
// Two product surfaces:
//   1. POST /ai/trainer-card  — anime trainer-card portrait from user photo
//                                using the @kingbulljs prompt template.
//   2. POST /ai/team-art      — hyperrealistic 3D team portrait using the
//                                @Roblogs prompt template (user as trainer
//                                in center, mons surrounding, low angle).
//
// Backend: fal.ai's nano-banana (Gemini 2.5 Flash Image) — $0.039/image,
// supports image-to-image with a face-preservation prompt. Alternative
// providers (Replicate flux, Bytedance seedream) can be swapped with a
// one-line endpoint change.
//
// Premium gating: free users get 0 generations/mo; premium users get N
// included per month (enforced via KV counter keyed on the JWT `sub`).
//
// Rate limiting: stricter than other routes — 5/hr/IP regardless of
// premium, to prevent flooding the fal.ai quota.

import type { Env } from './index';
import { jsonOk, jsonError } from './index';
import { verifyLicense } from './jwt';
import { sanitizeStylePrompt } from './sanitize';
import { consumeCredit, refundCredit } from './credit-store';
export { sanitizeStylePrompt, type SanitizedPrompt } from './sanitize';

const FAL_API_BASE = 'https://fal.run/fal-ai';
const PREMIUM_MONTHLY_QUOTA = 5;

interface AIEnv extends Env {
  FAL_API_KEY?: string;
  AI_QUOTA_KV?: KVNamespace;
  // Image moderation has two backends, checked in this order:
  //   1. MODERATION_API_URL — an external HTTP provider. When set, every
  //      uploaded photo is POSTed to it; it returns JSON with `flagged`/`nsfw`.
  //   2. AI (Workers AI binding) — when no external URL is set but the binding
  //      is present (it is, in production — see wrangler.toml), uploads are
  //      screened in-account with a vision model. No external key required.
  // Either configured backend fails CLOSED (a provider/model error rejects the
  // upload rather than silently passing it unscreened). When NEITHER is present
  // (e.g. a self-host build without the binding) screening is skipped — the
  // same optional-service pattern as the quota KV.
  MODERATION_API_URL?: string;
  MODERATION_API_KEY?: string;
  AI?: Ai;
}

interface FalResponse {
  images?: Array<{ url: string; content_type?: string }>;
  image?: { url: string };
}

/**
 * POST /ai/trainer-card
 * Multipart body:
 *   photo     (Blob) — user's face photo, 1024×1024 jpeg/png recommended
 *   name      (string) — trainer name to embed
 *   year      (string, optional) — "Joined ${year}" stat
 *   vibe      (string, optional) — "calm" | "chaotic" | "balanced" — affects System Control rating
 *   starter   (string, optional) — "grass" | "fire" | "water" — chooses First Partner
 *   license   (string in `authorization: Bearer <jwt>` header) — premium JWT
 *
 * Returns: { imageUrl: string, generated_at: number, quotaRemaining: number }
 */
export async function aiTrainerCard(req: Request, env: AIEnv): Promise<Response> {
  if (!env.FAL_API_KEY) {
    return jsonError(req, env, 503, 'ai_not_configured');
  }

  const license = await requireAIEntitlement(req, env);
  if (!license.ok) return license.response;

  const form = await req.formData();
  const photo = form.get('photo');
  const name = form.get('name')?.toString().slice(0, 24) || 'Trainer';
  const year = form.get('year')?.toString() || new Date().getFullYear().toString();
  const vibe = form.get('vibe')?.toString() || 'balanced';
  const starter = form.get('starter')?.toString() || 'fire';
  const style = form.get('style')?.toString() || 'anime';

  if (!photo || typeof photo === 'string') {
    return jsonError(req, env, 400, 'photo_required');
  }
  if (photo.size > 8 * 1024 * 1024) {
    return jsonError(req, env, 413, 'photo_too_large', { max_mb: 8 });
  }

  const mod = await moderateUpload(req, env, photo);
  if (!mod.ok) return mod.response;

  // Meter the paid generation only after the request is fully validated and the
  // photo has cleared moderation — a missing/oversized/rejected upload must not
  // burn one of the user's 5 monthly premium credits.
  const quota = await consumeEntitlement(env, license, 'trainer-card');
  if (!quota.ok) {
    const status = quota.errorCode === 'no_credits' ? 402 : 429;
    return jsonError(req, env, status, quota.errorCode || 'quota_exhausted', {
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    });
  }

  // Prompt template inspired by @kingbulljs — strict no-invention rules,
  // preserves face, picks a starter, builds a cohesive 6-mon team with one
  // Mega Evolution, embeds trainer stats.
  const prompt = buildTrainerCardPrompt({ name, year, vibe, starter, style });

  // If the generation pipeline fails (R2 upload or fal.ai), refund the credit
  // before surfacing the error so a transient upstream failure never costs the
  // user a paid generation.
  let result: { imageUrl: string };
  try {
    // Persist the exact server-authored prompt on the R2 object for an audit
    // trail (DMCA / abuse review can see what was asked of the model).
    const photoUrl = await uploadToR2(env, photo, `trainer-cards/${crypto.randomUUID()}.png`, {
      kind: 'trainer-card',
      prompt: prompt.slice(0, 2048),
      by: license.email,
    });
    result = await falImageEdit(env, {
      image_url: photoUrl,
      prompt,
      aspect_ratio: '3:4',
    });
  } catch (e) {
    await refundEntitlement(env, license, 'trainer-card');
    throw e;
  }

  return jsonOk(req, env, {
    imageUrl: result.imageUrl,
    generatedAt: Date.now(),
    quotaRemaining: quota.remaining,
  });
}

/**
 * POST /ai/team-art
 * Same shape as /ai/trainer-card but with the Roblogs hyperrealistic-3D
 * prompt template. Optionally accepts a `team` field listing up to 6
 * Pokémon names to feature alongside the user.
 */
export async function aiTeamArt(req: Request, env: AIEnv): Promise<Response> {
  if (!env.FAL_API_KEY) {
    return jsonError(req, env, 503, 'ai_not_configured');
  }

  const license = await requireAIEntitlement(req, env);
  if (!license.ok) return license.response;

  const form = await req.formData();
  const photo = form.get('photo');
  const style = form.get('style')?.toString() || 'hyperreal-3d';
  const teamRaw = form.get('team')?.toString() || '[]';
  let team: string[] = [];
  try { team = JSON.parse(teamRaw); } catch { /* malformed client field — treat as an empty team */ }

  if (!photo || typeof photo === 'string') {
    return jsonError(req, env, 400, 'photo_required');
  }
  if (photo.size > 8 * 1024 * 1024) {
    return jsonError(req, env, 413, 'photo_too_large', { max_mb: 8 });
  }

  const mod = await moderateUpload(req, env, photo);
  if (!mod.ok) return mod.response;

  // Meter the paid generation only after validation + moderation pass (see
  // aiTrainerCard) — failures upstream of this point must not consume a credit.
  const quota = await consumeEntitlement(env, license, 'team-art');
  if (!quota.ok) {
    const status = quota.errorCode === 'no_credits' ? 402 : 429;
    return jsonError(req, env, status, quota.errorCode || 'quota_exhausted', {
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    });
  }

  const prompt = buildTeamArtPrompt({ teamMembers: team.slice(0, 6), style });

  let result: { imageUrl: string };
  try {
    const photoUrl = await uploadToR2(env, photo, `team-art/${crypto.randomUUID()}.png`, {
      kind: 'team-art',
      prompt: prompt.slice(0, 2048),
      by: license.email,
    });
    result = await falImageEdit(env, {
      image_url: photoUrl,
      prompt,
      aspect_ratio: '3:4',
    });
  } catch (e) {
    await refundEntitlement(env, license, 'team-art');
    throw e;
  }

  return jsonOk(req, env, {
    imageUrl: result.imageUrl,
    generatedAt: Date.now(),
    quotaRemaining: quota.remaining,
  });
}

/**
 * POST /ai/codex-card
 * Turns the user's photo into an ORIGINAL collectible trading-card-style image
 * in one of several curated finishes (classic/full-art/holo/gold/vintage/neo).
 * Multipart body:
 *   photo      (Blob) — user's face photo
 *   name       (string) — trainer/character name on the card
 *   cardStyle  (string, optional) — finish id (see CARD_STYLES)
 *   mon        (string, optional) — a creature name to feature alongside
 *   license    (Bearer JWT header) — premium
 * Returns: { imageUrl, generatedAt, quotaRemaining }
 */
export async function aiCodexCard(req: Request, env: AIEnv): Promise<Response> {
  if (!env.FAL_API_KEY) {
    return jsonError(req, env, 503, 'ai_not_configured');
  }

  const license = await requireAIEntitlement(req, env);
  if (!license.ok) return license.response;

  const form = await req.formData();
  const photo = form.get('photo');
  const name = form.get('name')?.toString().slice(0, 24) || 'Trainer';
  const cardStyle = form.get('cardStyle')?.toString() || 'classic';
  const mon = form.get('mon')?.toString().slice(0, 40) || '';
  // Custom-style inputs (both optional). Free text is sanitized server-side;
  // the reference card is a private STYLE reference only (palette/finish/mood),
  // never reproduced — enforced by prompt contract + the originality guard.
  const sanitized = sanitizeStylePrompt(form.get('prompt')?.toString());
  const reference = form.get('reference');
  const hasReference = !!reference && typeof reference !== 'string';

  if (!photo || typeof photo === 'string') {
    return jsonError(req, env, 400, 'photo_required');
  }
  if (photo.size > 8 * 1024 * 1024) {
    return jsonError(req, env, 413, 'photo_too_large', { max_mb: 8 });
  }
  if (hasReference && (reference as Blob).size > 8 * 1024 * 1024) {
    return jsonError(req, env, 413, 'reference_too_large', { max_mb: 8 });
  }

  const mod = await moderateUpload(req, env, photo);
  if (!mod.ok) return mod.response;
  // The reference image also reaches the model, so it must clear moderation too.
  if (hasReference) {
    const refMod = await moderateUpload(req, env, reference as Blob);
    if (!refMod.ok) return refMod.response;
  }

  const quota = await consumeEntitlement(env, license, 'codex-card');
  if (!quota.ok) {
    const status = quota.errorCode === 'no_credits' ? 402 : 429;
    return jsonError(req, env, status, quota.errorCode || 'quota_exhausted', {
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    });
  }

  const prompt = buildCodexCardPrompt({
    name, cardStyle, mon,
    styleHint: sanitized.text || undefined,
    hasReference,
  });

  let result: { imageUrl: string };
  try {
    const photoUrl = await uploadToR2(env, photo, `codex-cards/${crypto.randomUUID()}.png`, {
      kind: 'codex-card',
      prompt: prompt.slice(0, 2048),
      by: license.email,
      // Audit trail: record what free-text was supplied and what we stripped.
      promptRawRemoved: sanitized.removed.join(',').slice(0, 256),
    });
    const image_urls = [photoUrl];
    if (hasReference) {
      const refUrl = await uploadToR2(env, reference as Blob, `codex-cards/ref-${crypto.randomUUID()}.png`, {
        kind: 'codex-card-reference',
        by: license.email,
      });
      image_urls.push(refUrl);
    }
    result = await falImageEdit(env, {
      image_urls,
      prompt,
      aspect_ratio: '3:4',
    });
  } catch (e) {
    await refundEntitlement(env, license, 'codex-card');
    throw e;
  }

  return jsonOk(req, env, {
    imageUrl: result.imageUrl,
    generatedAt: Date.now(),
    quotaRemaining: quota.remaining,
  });
}

// ============================================================
// PROMPTS — kept in source (server-side) so they can be tuned without
// redeploying the client and can never be supplied by the caller. The client
// sends only structured fields (name/vibe/starter/team/cardStyle/mon); the
// prompt text is authored here and persisted to R2 object metadata for audit.
// ============================================================

// Legal art-direction guard appended to every prompt. The output must read as
// an original, stylized interpretation — not a reproduction of, or trace over,
// official Pokémon artwork, logos, or trade dress. This is the model-facing
// half of the same bright line the merch + listing code enforces.
const LEGAL_ART_DIRECTION = `
ART DIRECTION & ORIGINALITY (REQUIRED):
- Produce ORIGINAL, anime-inspired art direction. Do NOT copy, trace, or
  reproduce official Pokémon artwork, promotional renders, the Pokémon logo,
  trainer-card layouts from the games, or any official trade dress.
- Creature designs are generic, original interpretations in this art style —
  not pixel- or line-faithful copies of official sprites or models.
- No official logos, wordmarks, watermarks, copyright lines, or game UI chrome.
- This is fan-made, transformative art and must look distinct from first-party
  Pokémon media.`;

function buildTrainerCardPrompt(opts: { name: string; year: string; vibe: string; starter: string; style: string }): string {
  const { name, year, vibe, starter, style } = opts;
  const starterMap: Record<string, string> = {
    grass: 'a Grass-type starter Pokémon (Bulbasaur, Chikorita, Treecko, Turtwig, Snivy, Chespin, Rowlet, Grookey, or Sprigatito)',
    fire:  'a Fire-type starter Pokémon (Charmander, Cyndaquil, Torchic, Chimchar, Tepig, Fennekin, Litten, Scorbunny, or Fuecoco)',
    water: 'a Water-type starter Pokémon (Squirtle, Totodile, Mudkip, Piplup, Oshawott, Froakie, Popplio, Sobble, or Quaxly)',
  };
  const starterText = starterMap[starter] || starterMap.fire;
  const systemControl = vibe === 'calm' ? '7-9' : vibe === 'chaotic' ? '2-4' : '5-7';

  return `Create an anime-style Pokémon trainer card based on the uploaded photo.

STRICT RULES:
- Preserve the subject's facial features EXACTLY. Do not invent or alter the face.
- English language for everything except "Player Name".
- Use only the name "${name}" — do not create a different name.

FIRST PARTNER:
- Choose ${starterText}
- Show base form only
- Standard Poké Ball
- No moves, items, or extra details on the First Partner

6-POKÉMON TEAM:
- Build a cohesive team of EXACTLY 6 Pokémon that match the photo's vibe
- The FINAL EVOLUTION of the same First Partner MUST appear as one of the 6
- Diverse types — no single type dominating
- Each team member must show: name, types, 1 recognizable signature move,
  1 common held item, capture ball used (Poké Ball, Great Ball, Ultra Ball, etc.)
- If dual-type, show BOTH types
- Include exactly 1 Mega Evolution, clearly shown
- 2% chance: include 1 shiny Pokémon (subtle sparkle icon only)

TRAINER STATS (must be logically consistent):
- Pokédex Seen: 400-800
- Pokédex Caught: 300-600 (always lower than Seen)
- Joined: ${year}
- 1-2 light extra stats
- Strengths · Weaknesses · Playstyle
- 1-2 line short backstory
- Signature Stat: "System Control" rated ${systemControl} (calm vibe = higher, chaotic = lower)

DESIGN:
- Anime style
- Pokémon trainer outfit matching photo's vibe
- First Partner shown separately from the 6-member team display
- Full 6-Pokémon team in a clean infographic layout
- Mega form appears naturally in the lineup
- Balanced, not cluttered

EXCLUDE:
- Hometown, rival, trainer-type random profile sections
- Any section not listed above
${trainerCardStyleLine(style)}
${LEGAL_ART_DIRECTION}`;
}

function buildTeamArtPrompt(opts: { teamMembers: string[]; style: string }): string {
  const team = opts.teamMembers.length > 0
    ? `Featured Pokémon (smaller than the person, surrounding): ${opts.teamMembers.join(', ')}.`
    : '';
  return `Take this person as reference. Render in hyperrealistic 3D, extreme close-up.
${team}

POSE & COMPOSITION:
- All characters standing, facing forward, prideful, looking down on the viewer
- Low angle from below, chin up, eyes directly at camera from above
- Dominant attitude
- Extreme close-up, opressive sensation
- Person in the center holding a Poké Ball in an anime-protagonist pose
- Modern young-adult Pokémon-world outfit

POKÉMON IN FRAME:
- Pokémon scaled smaller than the person
- Surrounding the trainer, also looking down at the viewer
- Maintain their distinct features and colors

VISUAL STYLE:
- Cold tones, blurred backgrounds with lights and shadows + mist
- 8K resolution, extreme skin texture detail
- Well-defined hair roots, cinematic lighting
- Full 3D CGI texture, professional modeler quality
- 3:4 aspect ratio

CRITICAL:
- Preserve the subject's facial features strictly
- Do not alter or replace the face
${teamArtStyleLine(opts.style)}
${LEGAL_ART_DIRECTION}`;
}

// ============================================================
// STYLE PRESETS — server-authored "looks" the client selects by id. The client
// never sends free prompt text; it picks a curated style and we append the
// matching art-direction snippet. Unknown ids fall back to the first entry.
// ============================================================

const TRAINER_CARD_STYLES: Record<string, string> = {
  anime: 'Polished modern anime illustration with vibrant cel shading and clean linework.',
  'retro-90s': 'Retro late-1990s anime aesthetic — grainy film texture, muted palette, hand-inked lines.',
  watercolor: 'Soft hand-painted watercolor illustration, gentle gradients, visible paper texture.',
  synthwave: 'Neon synthwave palette — magenta and cyan rim light, glow, subtle grid horizon.',
  storybook: 'Warm hand-painted storybook style, soft edges, whimsical and inviting.',
};

const TEAM_ART_STYLES: Record<string, string> = {
  'hyperreal-3d': 'Hyperrealistic 3D CGI render, cinematic lighting, extreme texture detail.',
  cinematic: 'Cinematic movie-poster composition, dramatic key light, atmospheric depth haze.',
  'comic-ink': 'Bold comic-book ink with halftone shading and dynamic action framing.',
  vaporwave: 'Vaporwave palette — chrome, pastels, dreamy retro-future mood and glow.',
};

// Original, transformative collectible-card finishes. These describe a LOOK,
// never a specific copyrighted set, frame, or trade dress.
const CARD_STYLES: Record<string, { label: string; direction: string }> = {
  classic: {
    label: 'Classic',
    direction: 'Clean bordered collectible-card layout: a framed illustration window in the upper two-thirds, a name banner across the top, and a tidy stat strip along the bottom. Crisp, balanced, timeless.',
  },
  'full-art': {
    label: 'Full Art',
    direction: 'Edge-to-edge full-bleed illustration with the subject breaking past the frame; a translucent name banner overlays the lower third. Dramatic, premium, immersive.',
  },
  holo: {
    label: 'Holo Rainbow',
    direction: 'Holographic rainbow-foil treatment — prismatic shimmer, light refraction streaks, and a glossy reflective sheen across the card surface.',
  },
  gold: {
    label: 'Gold Premium',
    direction: 'Premium gold-trimmed "secret rare" finish — brushed-gold borders, embossed detailing, warm metallic highlights on a dark field.',
  },
  vintage: {
    label: 'Vintage',
    direction: 'Retro 1990s trading-card feel — slightly worn matte paper texture, rounded corners, soft print registration, nostalgic muted inks.',
  },
  neo: {
    label: 'Neo Burst',
    direction: 'Modern glossy card with a dynamic energy-burst backdrop, bold geometric accents, and high-saturation lighting. Sleek and contemporary.',
  },
};

// Extra legal guard specific to card generation — the highest-risk surface,
// since a "trading card" most strongly evokes official trade dress. Keeps the
// frame, marks, and symbols original.
const CARD_LEGAL_GUARD = `
COLLECTIBLE-CARD ORIGINALITY (REQUIRED):
- The card frame, borders, layout, and any badges/symbols are ORIGINAL designs.
  Do NOT reproduce the official Pokémon Trading Card Game frame, energy symbols,
  set symbols, rarity icons, or the Pokémon TCG logo/wordmark.
- Any wordmark on the card reads "TRAINER'S CODEX" — never "Pokémon" or a real set name.
- The featured creature is a generic, original interpretation in this art style,
  not a line-faithful copy of an official sprite, model, or card illustration.
- This is original fan art and must be visibly distinct from an authentic TCG card.`;

function trainerCardStyleLine(style: string): string {
  const dir = TRAINER_CARD_STYLES[style] || TRAINER_CARD_STYLES.anime;
  return `\nVISUAL STYLE: ${dir}`;
}

function teamArtStyleLine(style: string): string {
  const dir = TEAM_ART_STYLES[style] || TEAM_ART_STYLES['hyperreal-3d'];
  return `\nVISUAL STYLE OVERRIDE: ${dir}`;
}

function buildCodexCardPrompt(opts: {
  name: string; cardStyle: string; mon: string;
  styleHint?: string; hasReference?: boolean;
}): string {
  const { name, cardStyle, mon, styleHint, hasReference } = opts;
  const style = CARD_STYLES[cardStyle] || CARD_STYLES.classic;
  const monLine = mon
    ? `- Feature ONE signature creature alongside the trainer: an original, stylized interpretation evoking "${mon}". Keep it clearly original art, not a copy of official artwork.`
    : '- Feature ONE original, stylized signature creature that fits the trainer\'s vibe.';

  // The sanitized free-text hint guides MOOD/PALETTE/FINISH only — never a
  // literal character/logo. If a reference image is attached, it is the second
  // image_url and is bound by the same "style only" contract.
  const hintBlock = styleHint
    ? `\nUSER STYLE HINT (apply to mood, color palette, lighting, and finish ONLY — never to reproduce any specific named character, mascot, logo, set, or card layout): "${styleHint}"`
    : '';
  const refBlock = hasReference
    ? `\nSTYLE REFERENCE IMAGE:
- A SECOND image is attached strictly as a STYLE reference.
- Use it ONLY for its color palette, lighting, finish, and overall mood.
- Do NOT copy its character, creature, pose, text, frame, borders, logos,
  symbols, or any trade dress. Do NOT reproduce or trace any part of it.
- The result must be an ORIGINAL composition featuring the uploaded person's
  face from the FIRST image — visibly distinct from the reference.`
    : '';

  return `Create an ORIGINAL collectible trading-card-style image based on the uploaded photo (the FIRST image).

STRICT RULES:
- Preserve the subject's facial features EXACTLY from the first image. Do not invent or alter the face.
- The person appears as a stylized "trainer" character on the card.
- Use only the name "${name}" as the card's title/character name.

CARD CONTENT:
${monLine}
- Include a clean illustration of the trainer (and the creature) as the card art.
- Add a tasteful name banner with "${name}" and a small set of original-looking stat pips/labels (HP-style number, a couple of attack-style lines with original move names). Keep all symbols ORIGINAL.
- 3:4 portrait card orientation, centered, print-ready, with a subtle margin so it can be cut as a physical card.

CARD FINISH — ${style.label}:
- ${style.direction}${hintBlock}${refBlock}
${CARD_LEGAL_GUARD}
${LEGAL_ART_DIRECTION}`;
}

// ============================================================
// fal.ai client
// ============================================================

async function falImageEdit(env: AIEnv, opts: { image_url?: string; image_urls?: string[]; prompt: string; aspect_ratio: string }): Promise<{ imageUrl: string }> {
  // Accept either a single image_url (back-compat) or an ordered image_urls
  // array. For multi-image edits the FIRST url is the face to preserve; any
  // subsequent urls are style references bound by the prompt's "style only"
  // contract.
  const image_urls = opts.image_urls ?? (opts.image_url ? [opts.image_url] : []);
  const resp = await fetch(`${FAL_API_BASE}/nano-banana/edit`, {
    method: 'POST',
    headers: {
      'authorization': `Key ${env.FAL_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      image_urls,
      prompt: opts.prompt,
      num_images: 1,
      output_format: 'png',
      aspect_ratio: opts.aspect_ratio,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`fal_${resp.status}: ${text.slice(0, 200)}`);
  }
  const body = await resp.json() as FalResponse;
  const url = body.images?.[0]?.url ?? body.image?.url;
  if (!url) throw new Error('fal_response_missing_image');
  return { imageUrl: url };
}

// ============================================================
// R2 helpers
// ============================================================

async function uploadToR2(env: AIEnv, blob: Blob | File, key: string, meta?: Record<string, string>): Promise<string> {
  const buf = await blob.arrayBuffer();
  await env.PRINTS_BUCKET.put(key, buf, {
    httpMetadata: { contentType: blob.type || 'image/png' },
    customMetadata: meta,
  });
  const base = (env as unknown as { PRINTS_PUBLIC_BASE?: string }).PRINTS_PUBLIC_BASE
    || 'https://cdn.trainerscodex.com';
  return `${base}/${key}`;
}

// ============================================================
// Image moderation
// ============================================================
// Screen the user's uploaded photo before it reaches fal.ai. Two backends are
// tried in order: an external HTTP provider (MODERATION_API_URL) first, then
// the in-account Workers AI vision model (env.AI binding). Either configured
// backend fails CLOSED: a flagged image → 422; a provider/model error → 503
// (a configured gate must not silently pass unscreened uploads). If neither
// backend is present, screening is skipped (self-host optional-service pattern).

async function moderateUpload(
  req: Request, env: AIEnv, blob: Blob | File,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (env.MODERATION_API_URL) {
    return moderateWithProvider(req, env, env.MODERATION_API_URL, blob);
  }
  if (env.AI) {
    return moderateWithWorkersAI(req, env, blob);
  }
  return { ok: true };
}

async function moderateWithProvider(
  req: Request, env: AIEnv, url: string, blob: Blob | File,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  try {
    const headers: Record<string, string> = { 'content-type': blob.type || 'image/png' };
    if (env.MODERATION_API_KEY) headers['authorization'] = `Bearer ${env.MODERATION_API_KEY}`;
    const resp = await fetch(url, { method: 'POST', headers, body: await blob.arrayBuffer() });
    if (!resp.ok) {
      return { ok: false, response: jsonError(req, env, 503, 'moderation_unavailable') };
    }
    const verdict = await resp.json() as { flagged?: boolean; nsfw?: boolean; reason?: string };
    if (verdict.flagged || verdict.nsfw) {
      return { ok: false, response: jsonError(req, env, 422, 'image_rejected', { reason: verdict.reason || 'flagged' }) };
    }
    return { ok: true };
  } catch {
    return { ok: false, response: jsonError(req, env, 503, 'moderation_unavailable') };
  }
}

// Vision-model rubric. Calibrated for a general-audience product where users
// upload a personal portrait/selfie to be stylized — ordinary clothed photos
// (including children in normal, non-sexual contexts) must pass; the bright
// lines are sexual content, sexualized/exploitative depictions of minors,
// graphic violence, and other unlawful imagery.
const MODERATION_RUBRIC = `You are an image-safety classifier for a general-audience app where people upload a personal photo (usually a selfie or portrait) to be turned into stylized art.

Classify the image as UNSAFE only if it contains any of:
- nudity, or sexually explicit or suggestive content
- a minor (apparent age under 18) depicted in a nude, sexualized, or exploitative way
- graphic violence, gore, or self-harm
- hateful, extremist, or terrorist symbols
- other clearly unlawful content

Ordinary clothed photos of people — including children photographed normally and non-sexually — are SAFE.

Answer with EXACTLY one word on the first line: SAFE or UNSAFE. If UNSAFE, append a brief reason after the word on the same line.`;

async function moderateWithWorkersAI(
  req: Request, env: AIEnv, blob: Blob | File,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  try {
    const dataUrl = `data:${blob.type || 'image/png'};base64,${arrayBufferToBase64(await blob.arrayBuffer())}`;
    const ai = env.AI as unknown as {
      run(model: string, inputs: Record<string, unknown>): Promise<{ response?: string }>;
    };
    const out = await ai.run('@cf/meta/llama-3.2-11b-vision-instruct', {
      image: dataUrl,
      messages: [
        { role: 'system', content: MODERATION_RUBRIC },
        { role: 'user', content: 'Classify the attached image. First word must be SAFE or UNSAFE.' },
      ],
      max_tokens: 64,
      temperature: 0,
    });
    const raw = (out.response || '').trim();
    // Check UNSAFE first — "UNSAFE" contains the substring "SAFE".
    if (/unsafe/i.test(raw)) {
      const reason = raw.replace(/^\W*unsafe\W*/i, '').slice(0, 160).trim() || 'flagged';
      return { ok: false, response: jsonError(req, env, 422, 'image_rejected', { reason }) };
    }
    if (/safe/i.test(raw)) {
      return { ok: true };
    }
    // Unparseable verdict → fail closed; never pass an unscreened upload.
    return { ok: false, response: jsonError(req, env, 503, 'moderation_unavailable') };
  } catch {
    return { ok: false, response: jsonError(req, env, 503, 'moderation_unavailable') };
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ============================================================
// Premium gate + monthly quota
// ============================================================

interface LicenseCheck {
  ok: true;
  email: string;
  sub: string;
  // 'premium' spends against the monthly quota; 'credits' spends one credit
  // from the buyer's KV balance.
  mode: 'premium' | 'credits';
}
interface LicenseFail {
  ok: false;
  response: Response;
}

// Accept either a premium subscription token OR a credits token. Either one is a
// valid way to reach the AI routes; which budget gets spent is decided later by
// consumeEntitlement.
async function requireAIEntitlement(req: Request, env: AIEnv): Promise<LicenseCheck | LicenseFail> {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return { ok: false, response: jsonError(req, env, 401, 'license_required') };
  }
  const claims = await verifyLicense(env, m[1]);
  if (!claims) {
    return { ok: false, response: jsonError(req, env, 401, 'license_required') };
  }
  if (claims.plan !== 'premium' && claims.plan !== 'credits') {
    return { ok: false, response: jsonError(req, env, 403, 'premium_required') };
  }
  return { ok: true, email: claims.email, sub: claims.sub, mode: claims.plan };
}

// Spend one unit of the caller's entitlement. Premium → monthly per-kind quota;
// credits → a single shared credit. Returns ok:false (with an error code) when
// the relevant budget is empty.
async function consumeEntitlement(
  env: AIEnv, ent: LicenseCheck, kind: string,
): Promise<{ ok: boolean; remaining: number; resetAt: number; errorCode?: string }> {
  if (ent.mode === 'premium') {
    const q = await checkAndIncrementQuota(env, ent.email, kind);
    return { ok: q.ok, remaining: q.remaining, resetAt: q.resetAt, errorCode: q.ok ? undefined : 'quota_exhausted' };
  }
  // credits
  if (!env.AI_QUOTA_KV) {
    // No store configured — treat credits as unavailable rather than free.
    return { ok: false, remaining: 0, resetAt: 0, errorCode: 'no_credits' };
  }
  const c = await consumeCredit(env.AI_QUOTA_KV, ent.email);
  return { ok: c.ok, remaining: c.balance, resetAt: 0, errorCode: c.ok ? undefined : 'no_credits' };
}

async function refundEntitlement(env: AIEnv, ent: LicenseCheck, kind: string): Promise<void> {
  if (ent.mode === 'premium') {
    await refundQuota(env, ent.email, kind);
  } else if (env.AI_QUOTA_KV) {
    await refundCredit(env.AI_QUOTA_KV, ent.email);
  }
}

async function checkAndIncrementQuota(env: AIEnv, email: string, kind: string): Promise<{ ok: boolean; remaining: number; resetAt: number }> {
  if (!env.AI_QUOTA_KV) {
    // Quota tracking optional — if KV not configured, allow but warn.
    return { ok: true, remaining: PREMIUM_MONTHLY_QUOTA, resetAt: 0 };
  }
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const key = `ai:${month}:${email}:${kind}`;
  const raw = await env.AI_QUOTA_KV.get(key);
  const used = raw ? parseInt(raw, 10) : 0;
  if (used >= PREMIUM_MONTHLY_QUOTA) {
    const resetAt = new Date(Date.UTC(
      parseInt(month.slice(0, 4), 10),
      parseInt(month.slice(5, 7), 10),
      1,
    )).getTime();
    return { ok: false, remaining: 0, resetAt };
  }
  await env.AI_QUOTA_KV.put(key, String(used + 1), { expirationTtl: 35 * 24 * 3600 });
  return { ok: true, remaining: PREMIUM_MONTHLY_QUOTA - used - 1, resetAt: 0 };
}

// Give back a credit consumed by checkAndIncrementQuota when the downstream
// generation fails. Best-effort and idempotent-safe: never drives the counter
// below zero, and a no-op when quota tracking is disabled.
async function refundQuota(env: AIEnv, email: string, kind: string): Promise<void> {
  if (!env.AI_QUOTA_KV) return;
  const month = new Date().toISOString().slice(0, 7);
  const key = `ai:${month}:${email}:${kind}`;
  const raw = await env.AI_QUOTA_KV.get(key);
  const used = raw ? parseInt(raw, 10) : 0;
  if (used > 0) {
    await env.AI_QUOTA_KV.put(key, String(used - 1), { expirationTtl: 35 * 24 * 3600 });
  }
}
