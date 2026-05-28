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

const FAL_API_BASE = 'https://fal.run/fal-ai';
const PREMIUM_MONTHLY_QUOTA = 5;

interface AIEnv extends Env {
  FAL_API_KEY?: string;
  AI_QUOTA_KV?: KVNamespace;
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

  const license = await requirePremiumLicense(req, env);
  if (!license.ok) return license.response;

  const quota = await checkAndIncrementQuota(env, license.email, 'trainer-card');
  if (!quota.ok) {
    return jsonError(req, env, 429, 'quota_exhausted', {
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    });
  }

  const form = await req.formData();
  const photo = form.get('photo');
  const name = form.get('name')?.toString().slice(0, 24) || 'Trainer';
  const year = form.get('year')?.toString() || new Date().getFullYear().toString();
  const vibe = form.get('vibe')?.toString() || 'balanced';
  const starter = form.get('starter')?.toString() || 'fire';

  if (!(photo instanceof File) && !(photo instanceof Blob)) {
    return jsonError(req, env, 400, 'photo_required');
  }
  if (photo.size > 8 * 1024 * 1024) {
    return jsonError(req, env, 413, 'photo_too_large', { max_mb: 8 });
  }

  const photoUrl = await uploadToR2(env, photo, `trainer-cards/${crypto.randomUUID()}.png`);

  // Prompt template inspired by @kingbulljs — strict no-invention rules,
  // preserves face, picks a starter, builds a cohesive 6-mon team with one
  // Mega Evolution, embeds trainer stats.
  const prompt = buildTrainerCardPrompt({ name, year, vibe, starter });

  const result = await falImageEdit(env, {
    image_url: photoUrl,
    prompt,
    aspect_ratio: '3:4',
  });

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

  const license = await requirePremiumLicense(req, env);
  if (!license.ok) return license.response;

  const quota = await checkAndIncrementQuota(env, license.email, 'team-art');
  if (!quota.ok) {
    return jsonError(req, env, 429, 'quota_exhausted', {
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    });
  }

  const form = await req.formData();
  const photo = form.get('photo');
  const teamRaw = form.get('team')?.toString() || '[]';
  let team: string[] = [];
  try { team = JSON.parse(teamRaw); } catch {}

  if (!(photo instanceof File) && !(photo instanceof Blob)) {
    return jsonError(req, env, 400, 'photo_required');
  }

  const photoUrl = await uploadToR2(env, photo, `team-art/${crypto.randomUUID()}.png`);
  const prompt = buildTeamArtPrompt({ teamMembers: team.slice(0, 6) });

  const result = await falImageEdit(env, {
    image_url: photoUrl,
    prompt,
    aspect_ratio: '3:4',
  });

  return jsonOk(req, env, {
    imageUrl: result.imageUrl,
    generatedAt: Date.now(),
    quotaRemaining: quota.remaining,
  });
}

// ============================================================
// PROMPTS — kept in source so they can be tuned without redeploying
// ============================================================

function buildTrainerCardPrompt(opts: { name: string; year: string; vibe: string; starter: string }): string {
  const { name, year, vibe, starter } = opts;
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
- Any section not listed above`;
}

function buildTeamArtPrompt(opts: { teamMembers: string[] }): string {
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
- Do not alter or replace the face`;
}

// ============================================================
// fal.ai client
// ============================================================

async function falImageEdit(env: AIEnv, opts: { image_url: string; prompt: string; aspect_ratio: string }): Promise<{ imageUrl: string }> {
  const resp = await fetch(`${FAL_API_BASE}/nano-banana/edit`, {
    method: 'POST',
    headers: {
      'authorization': `Key ${env.FAL_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      image_urls: [opts.image_url],
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

async function uploadToR2(env: AIEnv, blob: Blob | File, key: string): Promise<string> {
  const buf = await blob.arrayBuffer();
  await env.PRINTS_BUCKET.put(key, buf, {
    httpMetadata: { contentType: blob.type || 'image/png' },
  });
  const base = (env as unknown as { PRINTS_PUBLIC_BASE?: string }).PRINTS_PUBLIC_BASE
    || 'https://cdn.trainerscodex.com';
  return `${base}/${key}`;
}

// ============================================================
// Premium gate + monthly quota
// ============================================================

interface LicenseCheck {
  ok: true;
  email: string;
  sub: string;
}
interface LicenseFail {
  ok: false;
  response: Response;
}

async function requirePremiumLicense(req: Request, env: AIEnv): Promise<LicenseCheck | LicenseFail> {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return { ok: false, response: jsonError(req, env, 401, 'license_required') };
  }
  const claims = await verifyLicense(env, m[1]);
  if (!claims || claims.plan !== 'premium') {
    return { ok: false, response: jsonError(req, env, 403, 'premium_required') };
  }
  return { ok: true, email: claims.email, sub: claims.sub };
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
