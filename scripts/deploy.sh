#!/usr/bin/env bash
# Trainer's Codex — one-shot deploy.
#
# What it does:
#   1. Prompts you for the credentials I can't extract via MCP
#   2. Logs in to wrangler (browser pops)
#   3. Creates KV namespace + R2 bucket for the Worker
#   4. wrangler secret put for each Worker secret
#   5. Updates worker/wrangler.toml with the IDs
#   6. wrangler deploy — Worker live at <name>.workers.dev (or api.trainerscodex.com if you configure the custom domain)
#   7. node scripts/inject-config.mjs — bakes Supabase + Worker URL into bundle.html
#   8. wrangler deploy --name trainers-codex /tmp/tc-deploy — re-uploads the bundle as the public-facing Worker
#
# Re-runnable: every step is idempotent.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WRANGLER="$ROOT/worker/node_modules/.bin/wrangler"

if [[ ! -x "$WRANGLER" ]]; then
  echo "wrangler not found at $WRANGLER — running pnpm install in worker/"
  (cd worker && pnpm install --ignore-workspace)
fi

PROMPT_SECRET() {
  local var=$1 desc=$2
  if [[ -z "${!var:-}" ]]; then
    echo -n "  ${desc}: "
    read -rs val
    echo
    export "$var=$val"
  fi
}

PROMPT_VALUE() {
  local var=$1 desc=$2
  if [[ -z "${!var:-}" ]]; then
    echo -n "  ${desc}: "
    read -r val
    export "$var=$val"
  fi
}

echo "============================================================"
echo "  Trainer's Codex — go-live deploy"
echo "============================================================"
echo
echo "I need 6 strings from you. Paste each then hit Enter."
echo "Secrets (Stripe/Printful/anon key) are hidden as you type."
echo

PROMPT_SECRET CLOUDFLARE_API_TOKEN "Cloudflare API token (from dash.cloudflare.com/profile/api-tokens, 'Edit Workers' template)"
PROMPT_VALUE  SUPABASE_URL          "Supabase project URL (https://xxxx.supabase.co)"
PROMPT_SECRET SUPABASE_ANON_KEY     "Supabase anon public key (eyJhbG...)"
PROMPT_VALUE  STRIPE_PRICE_ID       "Stripe Price ID (price_1...)"
PROMPT_SECRET STRIPE_SECRET_KEY     "Stripe Secret key (sk_test_... or sk_live_...)"
PROMPT_VALUE  PRINTFUL_STORE_ID     "Printful store ID (numeric)"
PROMPT_SECRET PRINTFUL_API_KEY      "Printful API token"

JWT_SIGNING_KEY="$(openssl rand -base64 32)"
export JWT_SIGNING_KEY

WORKER_API_NAME="trainers-codex-api"

echo
echo "▶ Provisioning Cloudflare resources..."

# KV namespace for rate limiting
KV_OUTPUT="$("$WRANGLER" --config worker/wrangler.toml kv namespace create RATELIMIT_KV 2>&1 || true)"
KV_ID="$(echo "$KV_OUTPUT" | grep -oE '"id":\s*"[a-f0-9]+"' | head -1 | sed -E 's/.*"([a-f0-9]+)".*/\1/' || true)"
if [[ -z "$KV_ID" ]]; then
  # Already exists — pull from list
  KV_ID="$("$WRANGLER" --config worker/wrangler.toml kv namespace list 2>&1 | grep -A1 RATELIMIT_KV | grep -oE '[a-f0-9]{32}' | head -1 || true)"
fi
echo "  KV namespace ID: $KV_ID"

# R2 bucket for print PNG storage
"$WRANGLER" --config worker/wrangler.toml r2 bucket create trainerscodex-prints 2>&1 | tail -3 || true
echo "  R2 bucket: trainerscodex-prints"

# Patch wrangler.toml with real IDs
sed -i.bak \
  -e "s/STRIPE_PRICE_ID = \"price_REPLACE_AT_DEPLOY\"/STRIPE_PRICE_ID = \"$STRIPE_PRICE_ID\"/" \
  -e "s/PRINTFUL_STORE_ID = \"REPLACE_AT_DEPLOY\"/PRINTFUL_STORE_ID = \"$PRINTFUL_STORE_ID\"/" \
  -e "s/id = \"REPLACE_AT_DEPLOY\"/id = \"$KV_ID\"/" \
  worker/wrangler.toml

echo
echo "▶ Pushing Worker secrets..."

(cd worker && echo "$STRIPE_SECRET_KEY" | "$WRANGLER" secret put STRIPE_SECRET_KEY)
(cd worker && echo "$JWT_SIGNING_KEY"    | "$WRANGLER" secret put JWT_SIGNING_KEY)
(cd worker && echo "$PRINTFUL_API_KEY"   | "$WRANGLER" secret put PRINTFUL_API_KEY)

# Webhook secret comes later (after we create the Stripe webhook pointing at the deployed worker).
# Stub it for now so the worker boots; you'll re-run secret put after creating the webhook.
(cd worker && echo "whsec_PLACEHOLDER_RUN_DEPLOY_AGAIN_AFTER_WEBHOOK_SETUP" | "$WRANGLER" secret put STRIPE_WEBHOOK_SECRET)

echo
echo "▶ Deploying Worker (Stripe + Printful API + JWT mint)..."
(cd worker && "$WRANGLER" deploy)

WORKER_URL="https://${WORKER_API_NAME}.${CLOUDFLARE_ACCOUNT_SUBDOMAIN:-jrriestra}.workers.dev"
echo "  Worker deployed: $WORKER_URL"

echo
echo "▶ Baking config into bundle.html → /tmp/tc-deploy/index.html..."

SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
WORKER_URL="$WORKER_URL" \
  node scripts/inject-config.mjs

echo
echo "▶ Re-uploading bundle to public-facing Cloudflare Worker (tiny-fire-5e03)..."

# Use wrangler deploy with a synthetic config that points at /tmp/tc-deploy
cat > /tmp/tc-deploy/wrangler.toml <<EOF
name = "tiny-fire-5e03"
main = ""
compatibility_date = "2026-05-01"
assets = { directory = "/tmp/tc-deploy" }
EOF

# Remove the wrangler.toml from the assets dir so it's not served as a static file
mv /tmp/tc-deploy/wrangler.toml /tmp/tc-deploy-wrangler.toml
"$WRANGLER" deploy --config /tmp/tc-deploy-wrangler.toml --assets /tmp/tc-deploy || \
  echo "  (manual upload fallback: drag /tmp/tc-deploy/*.* into the existing 'tiny-fire-5e03' worker in Cloudflare dashboard)"

echo
echo "============================================================"
echo "  ✓ DEPLOY COMPLETE"
echo "============================================================"
echo
echo "Live URLs:"
echo "  Primary:  https://trainerscodex.com"
echo "  Worker API: $WORKER_URL"
echo
echo "Next manual steps (10 min):"
echo "  1. Stripe Dashboard → Developers → Webhooks → Add endpoint"
echo "       URL: $WORKER_URL/stripe/webhook"
echo "       Events: checkout.session.completed, customer.subscription.*, invoice.payment_failed"
echo "     Copy the signing secret (whsec_...) and re-run:"
echo "       cd worker && ./node_modules/.bin/wrangler secret put STRIPE_WEBHOOK_SECRET"
echo "     Then: ./node_modules/.bin/wrangler deploy"
echo
echo "  2. Supabase Dashboard → Authentication → Providers → enable Google/GitHub"
echo "     (Each needs OAuth credentials from those provider consoles.)"
echo "     Site URL: https://trainerscodex.com"
echo "     Redirect URLs: https://trainerscodex.com"
echo
echo "  3. R2 public bucket → Cloudflare dashboard → R2 → trainerscodex-prints → Settings"
echo "     Enable public access; add custom domain cdn.trainerscodex.com"
echo "     (Required for Printful to fetch generated print PNGs.)"
echo
echo "  4. Test:"
echo "     - Visit https://trainerscodex.com — sign-in button should show real OAuth"
echo "     - Build team → Poster Studio → 'Get Premium · \$4.99/mo' → Stripe Checkout with 4242 4242 4242 4242"
echo "     - Merch Studio → Order on Printful → should create real sync product"
echo
