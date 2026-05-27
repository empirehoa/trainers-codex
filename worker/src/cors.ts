import type { Env } from './index';

const ALLOWED_HEADERS = 'content-type, authorization, x-trainerscodex-session';
const ALLOWED_METHODS = 'GET, POST, OPTIONS';

function parseOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
}

export function originAllowed(req: Request, env: Env): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    // Same-origin requests don't include Origin. We allow them; the route
    // handlers don't trust the absence of an origin for anything sensitive.
    return true;
  }
  return parseOrigins(env).includes(origin);
}

export function applyCORS(resp: Response, req: Request, env: Env): Response {
  const origin = req.headers.get('origin');
  const allowed = parseOrigins(env);
  const matchedOrigin = origin && allowed.includes(origin) ? origin : null;

  const headers = new Headers(resp.headers);
  if (matchedOrigin) {
    headers.set('access-control-allow-origin', matchedOrigin);
    headers.set('vary', 'origin');
    headers.set('access-control-allow-credentials', 'true');
  }
  // Lock down responses so a misconfigured browser can't reframe them.
  headers.set('x-content-type-options', 'nosniff');
  return new Response(resp.body, { status: resp.status, headers });
}

export function preflight(req: Request, env: Env): Response {
  const origin = req.headers.get('origin');
  const allowed = parseOrigins(env);
  if (!origin || !allowed.includes(origin)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': ALLOWED_METHODS,
      'access-control-allow-headers': ALLOWED_HEADERS,
      'access-control-allow-credentials': 'true',
      'access-control-max-age': '600',
      'vary': 'origin',
    },
  });
}
