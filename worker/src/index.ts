// Trainer's Codex API Worker — Stripe + Printful + license JWT.
//
// Routes:
//   POST /stripe/checkout      → create Stripe Checkout session, return URL
//   POST /stripe/verify        → exchange session_id for license JWT
//   POST /stripe/webhook       → Stripe webhook receiver (handles subscription events)
//   POST /license/verify       → re-validate an existing JWT server-side
//   POST /printful/order       → upload PNG, create sync product, return checkout URL
//   POST /merch/checkout       → buyer checkout: PNG → R2 → Stripe payment session
//                                (webhook then places the Printful draft order)
//   GET  /health               → liveness probe
//
// All routes go through CORS + rate limit before reaching the handler.

import { applyCORS, preflight, originAllowed } from './cors';
import { rateLimit } from './ratelimit';
import { stripeCheckout, stripeVerify, stripeWebhook } from './stripe';
import { creditsCheckout, creditsVerify, creditsBalance } from './credits';
import { licenseVerify } from './jwt';
import { printfulOrder } from './printful';
import { merchCheckout } from './merch';
import { aiTrainerCard, aiTeamArt, aiCodexCard } from './ai';

export interface Env {
  // KV
  RATELIMIT_KV: KVNamespace;
  // R2
  PRINTS_BUCKET: R2Bucket;
  // Vars
  ALLOWED_ORIGINS: string;
  ENVIRONMENT: string;
  STRIPE_PRICE_ID: string;            // $4.99/mo Premium (subscription)
  STRIPE_PRICE_ANNUAL?: string;       // $39/yr Premium (subscription)
  // One-time credit packs (mode: payment). Each maps a pack id → Stripe price.
  STRIPE_PRICE_CREDITS_1?: string;    // $1.99 → 1 credit
  STRIPE_PRICE_CREDITS_5?: string;    // $6.99 → 5 credits
  STRIPE_PRICE_CREDITS_20?: string;   // $19.99 → 20 credits
  PRINTFUL_STORE_ID: string;
  // Server-side merch kill switch. Anything that can reach Printful or create a
  // paid physical-goods Checkout session (/merch/checkout, /printful/order, the
  // webhook fulfilment branch) refuses unless this is exactly '1'. Default "0"
  // in wrangler.toml. OWNER-ONLY: flipping it is the counsel gate, not a
  // config tweak — the client MERCH_CHECKOUT flag is UI only.
  MERCH_CHECKOUT?: string;
  // Secrets
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  JWT_SIGNING_KEY: string;
  PRINTFUL_API_KEY: string;
  // v6: AI image generation
  FAL_API_KEY?: string;
  AI_QUOTA_KV?: KVNamespace;
}

interface Route {
  method: string;
  path: string;
  handler: (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
  // Limit (per IP, per minute). 0 disables rate limiting (used for webhooks).
  ratePerMin: number;
}

const ROUTES: Route[] = [
  { method: 'POST', path: '/stripe/checkout',  handler: stripeCheckout,  ratePerMin: 10 },
  { method: 'POST', path: '/stripe/verify',    handler: stripeVerify,    ratePerMin: 30 },
  { method: 'POST', path: '/stripe/webhook',   handler: stripeWebhook,   ratePerMin: 0  },
  // One-time AI credit packs (no subscription).
  { method: 'POST', path: '/credits/checkout', handler: creditsCheckout, ratePerMin: 10 },
  { method: 'POST', path: '/credits/verify',   handler: creditsVerify,   ratePerMin: 30 },
  { method: 'POST', path: '/credits/balance',  handler: creditsBalance,  ratePerMin: 60 },
  { method: 'POST', path: '/license/verify',   handler: licenseVerify,   ratePerMin: 60 },
  { method: 'POST', path: '/printful/order',   handler: printfulOrder,   ratePerMin: 6  },
  // Paid merch: buyer-facing Stripe Checkout for a physical product. Ships
  // dark behind the SERVER MERCH_CHECKOUT var (default "0") as well as the
  // client flag of the same name; see worker/src/merch.ts.
  { method: 'POST', path: '/merch/checkout',   handler: merchCheckout,   ratePerMin: 6  },
  // v6: AI image generation — premium-gated, stricter rate limit
  { method: 'POST', path: '/ai/trainer-card',  handler: aiTrainerCard,   ratePerMin: 5  },
  { method: 'POST', path: '/ai/team-art',      handler: aiTeamArt,       ratePerMin: 5  },
  { method: 'POST', path: '/ai/codex-card',    handler: aiCodexCard,     ratePerMin: 5  },
  { method: 'GET',  path: '/health',           handler: health,          ratePerMin: 120 },
];

async function health(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true, time: new Date().toISOString() }), {
    headers: { 'content-type': 'application/json' },
  });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    // Preflight short-circuit — no rate limit, just CORS.
    if (req.method === 'OPTIONS') {
      return preflight(req, env);
    }

    const route = ROUTES.find(r => r.method === req.method && r.path === url.pathname);
    if (!route) {
      return notFound(req, env);
    }

    // Stripe webhooks must be accepted from Stripe's IPs — no CORS or rate limit there.
    // Origin check + rate limit applies to every other route.
    if (route.path !== '/stripe/webhook') {
      if (!originAllowed(req, env)) {
        return jsonError(req, env, 403, 'origin_not_allowed');
      }
      if (route.ratePerMin > 0) {
        // KV is a network dependency. If the limiter itself fails (binding
        // missing, KV outage) every money route FAILS CLOSED with a controlled
        // JSON 503 — not an unhandled throw that surfaces as an opaque
        // Cloudflare error page without CORS. /health alone degrades to
        // "allow" so uptime monitors can still distinguish a KV outage from
        // a dead worker.
        let limited: Response | null;
        try {
          limited = await rateLimit(req, env, route.path, route.ratePerMin);
        } catch (e) {
          console.error(`[${route.path}] rate limiter unavailable`, e);
          if (route.path !== '/health') {
            return jsonError(req, env, 503, 'rate_limit_unavailable');
          }
          limited = null;
        }
        if (limited) return limited;
      }
    }

    try {
      const resp = await route.handler(req, env, ctx);
      return applyCORS(resp, req, env);
    } catch (e) {
      // The real message (which may contain upstream Stripe/Printful/fal
      // response text) goes to the log only; the client gets a generic code.
      console.error(`[${route.path}]`, e);
      return jsonError(req, env, 500, 'internal');
    }
  },
};

function notFound(req: Request, env: Env): Response {
  return applyCORS(
    new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }),
    req, env,
  );
}

export function jsonError(req: Request, env: Env, status: number, code: string, extra?: Record<string, unknown>): Response {
  return applyCORS(
    new Response(JSON.stringify({ error: code, ...extra }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
    req, env,
  );
}

export function jsonOk(req: Request, env: Env, body: unknown): Response {
  return applyCORS(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    req, env,
  );
}
