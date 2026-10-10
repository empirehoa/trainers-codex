import type { Env } from './index';
import { applyCORS } from './cors';

/**
 * Per-IP-per-route rate limit using Cloudflare KV.
 * Returns a 429 Response if the caller has exceeded the limit, null otherwise.
 *
 * Counter granularity: per-minute bucket. We use one KV write per request and
 * one read; KV eventual consistency means the counter can be a few requests
 * behind across regions. That's acceptable for abuse-prevention buckets.
 */
export async function rateLimit(
  req: Request, env: Env, route: string, limitPerMin: number,
): Promise<Response | null> {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  const minute = Math.floor(Date.now() / 60_000);
  const key = `rl:${minute}:${route}:${ip}`;

  // A missing binding is a deploy misconfiguration, not a quiet "allow": throw
  // a clear error and let the router turn it into a controlled 503.
  if (!env.RATELIMIT_KV) throw new Error('RATELIMIT_KV binding missing — rate limiting unavailable');
  const raw = await env.RATELIMIT_KV.get(key);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= limitPerMin) {
    return applyCORS(
      new Response(JSON.stringify({
        error: 'rate_limited',
        retry_after_seconds: 60 - (Date.now() % 60_000) / 1000,
      }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': '60',
        },
      }),
      req, env,
    );
  }

  // Increment + TTL the bucket. 90s TTL leaves slack for the next minute boundary.
  await env.RATELIMIT_KV.put(key, String(count + 1), { expirationTtl: 90 });
  return null;
}
