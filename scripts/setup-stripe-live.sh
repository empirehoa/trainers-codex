#!/usr/bin/env bash
# setup-stripe-live.sh — provision the LIVE Stripe resources for Trainer's Codex.
#
# Idempotent: re-running reuses an existing product/price/webhook when it finds
# a match, and only creates what's missing.
#
# Prerequisites:
#   1. `stripe login` completed (authorizes this CLI against the account)
#   2. The Stripe account is ACTIVATED for live payments (business onboarding
#      done in Dashboard: bank account + identity). Live API calls fail otherwise.
#
# What it does:
#   - Finds-or-creates the "Trainer's Codex Premium Pack" live product
#   - Finds-or-creates a $4.99/mo recurring USD live price
#   - Finds-or-creates the live webhook endpoint → the API Worker, subscribed to
#     the 4 events the worker handles
#   - Prints STRIPE_PRICE_ID and (on first webhook creation) STRIPE_WEBHOOK_SECRET
#
# It does NOT touch your sk_live_ secret key — Stripe never exposes it; you set
# that one yourself (see the printed instructions at the end).

set -euo pipefail

WEBHOOK_URL="https://trainers-codex-api.jrriestra.workers.dev/stripe/webhook"
PRODUCT_NAME="Trainer's Codex Premium Pack"
PRICE_AMOUNT=499           # cents → $4.99
PRICE_CURRENCY="usd"
EVENTS="checkout.session.completed customer.subscription.deleted customer.subscription.updated invoice.payment_failed"

say() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
die() { printf '\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

command -v stripe >/dev/null || die "stripe CLI not found. brew install stripe/stripe-cli/stripe"

say "Verifying live access"
if ! stripe products list --live --limit 1 >/dev/null 2>&1; then
  die "Live API not accessible. Either 'stripe login' isn't done, or the account
  isn't activated for live payments yet. Activate live mode in the Dashboard
  (bank + identity) and re-run."
fi
echo "Live API reachable."

say "Find-or-create product: $PRODUCT_NAME"
PROD_ID=$(stripe products list --live --limit 100 \
  | jq -r --arg n "$PRODUCT_NAME" '.data[] | select(.name==$n and .active==true) | .id' | head -1)
if [ -z "$PROD_ID" ]; then
  PROD_ID=$(stripe products create --live \
    -d "name=$PRODUCT_NAME" \
    -d "description=Premium Pack — unlocks premium poster styles, merch designs, and 3D HOME sprites." \
    | jq -r '.id')
  echo "Created product: $PROD_ID"
else
  echo "Reusing product: $PROD_ID"
fi

say "Find-or-create price: \$4.99/mo recurring"
PRICE_ID=$(stripe prices list --live --product "$PROD_ID" --limit 100 \
  | jq -r --argjson amt "$PRICE_AMOUNT" --arg cur "$PRICE_CURRENCY" \
    '.data[] | select(.active==true and .unit_amount==$amt and .currency==$cur and .recurring.interval=="month") | .id' | head -1)
if [ -z "$PRICE_ID" ]; then
  PRICE_ID=$(stripe prices create --live \
    -d "product=$PROD_ID" \
    -d "unit_amount=$PRICE_AMOUNT" \
    -d "currency=$PRICE_CURRENCY" \
    -d "recurring[interval]=month" \
    -d "nickname=Premium Pack Monthly" \
    | jq -r '.id')
  echo "Created price: $PRICE_ID"
else
  echo "Reusing price: $PRICE_ID"
fi

say "Find-or-create webhook endpoint → $WEBHOOK_URL"
EXISTING_WH=$(stripe webhook_endpoints list --live --limit 100 \
  | jq -r --arg u "$WEBHOOK_URL" '.data[] | select(.url==$u) | .id' | head -1)
WH_SECRET=""
if [ -z "$EXISTING_WH" ]; then
  # shellcheck disable=SC2086
  CREATE_OUT=$(stripe webhook_endpoints create --live \
    -d "url=$WEBHOOK_URL" \
    $(for e in $EVENTS; do printf -- "-d enabled_events[]=%s " "$e"; done))
  WH_ID=$(echo "$CREATE_OUT" | jq -r '.id')
  WH_SECRET=$(echo "$CREATE_OUT" | jq -r '.secret')
  echo "Created webhook: $WH_ID"
else
  WH_ID="$EXISTING_WH"
  echo "Webhook already exists: $WH_ID"
  echo "(Stripe only returns the signing secret at creation time. If you need it,"
  echo " roll it in the Dashboard or delete + re-run this script.)"
fi

say "RESULTS"
echo "STRIPE_PRICE_ID=$PRICE_ID"
if [ -n "$WH_SECRET" ]; then
  echo "STRIPE_WEBHOOK_SECRET=$WH_SECRET"
fi

# Emit a machine-readable line the deploy automation can parse.
{
  echo "PRICE_ID=$PRICE_ID"
  echo "WEBHOOK_ID=$WH_ID"
  [ -n "$WH_SECRET" ] && echo "WEBHOOK_SECRET=$WH_SECRET"
} > /tmp/stripe-live-result.env

say "NEXT (the one secret this script can't set for you)"
cat <<'EOF'
Set your LIVE secret key on the Worker yourself (Stripe never prints sk_live_):

  1. Dashboard → Developers → API keys → toggle to "Live mode" → reveal Secret key
  2. Run (from the worker/ dir, with your Cloudflare token exported):
       wrangler secret put STRIPE_SECRET_KEY
     paste the sk_live_... value when prompted.

Results saved to /tmp/stripe-live-result.env
EOF
