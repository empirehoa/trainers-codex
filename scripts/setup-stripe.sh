#!/usr/bin/env bash
# setup-stripe.sh — provision the Stripe resources for Trainer's Codex in either
# TEST or LIVE mode. Idempotent: re-running reuses an existing product/price/
# webhook when it finds a match, and only creates what's missing.
#
# Usage:
#   scripts/setup-stripe.sh test     # uses the CLI's test-mode key (default)
#   scripts/setup-stripe.sh live     # uses the CLI's live-mode key
#
# Prerequisites:
#   1. `stripe login` completed (authorizes this CLI against the account)
#   2. For live: the account is ACTIVATED for live payments (bank + identity).
#
# What it provisions in the chosen mode:
#   - "Trainer's Codex Premium Pack" product
#   - $4.99/mo and $39/yr recurring prices
#   - "Trainer's Codex AI Credits" product + three one-time prices (1/5/20)
#   - The webhook endpoint → the API Worker, subscribed to the 4 handled events
#   - Prints every price id and (on first webhook creation) the signing secret
#
# It does NOT set STRIPE_SECRET_KEY on the Worker — Stripe never exposes the
# secret key; set that one yourself (see the printed instructions at the end).

set -euo pipefail

MODE="${1:-test}"
case "$MODE" in
  test) FLAG="" ;;            # stripe CLI defaults to test mode
  live) FLAG="--live" ;;
  *) printf '\033[31mERROR: mode must be "test" or "live" (got %s)\033[0m\n' "$MODE" >&2; exit 1 ;;
esac

# The CLI's `stripe login` token may be a RESTRICTED key (rk_live_…) that lacks
# Products/Prices/Webhook write scope — live writes then fail with a permissions
# error even though reads succeed. To unblock, run with an explicitly-scoped key:
#   STRIPE_API_KEY=sk_live_… scripts/setup-stripe.sh live
# When set, the key itself selects live/test, so --api-key REPLACES the mode flag.
if [ -n "${STRIPE_API_KEY:-}" ]; then
  FLAG="--api-key $STRIPE_API_KEY"
fi

WEBHOOK_URL="https://trainers-codex-api.jrriestra.workers.dev/stripe/webhook"
PRODUCT_NAME="Trainer's Codex Premium Pack"
PRICE_AMOUNT=499           # cents → $4.99
PRICE_ANNUAL_AMOUNT=3900   # cents → $39.00 (annual subscription)
PRICE_CURRENCY="usd"
EVENTS="checkout.session.completed customer.subscription.deleted customer.subscription.updated invoice.payment_failed"

# One-time AI credit packs (mode: payment). pack-id | credits | cents | nickname
CREDITS_PRODUCT_NAME="Trainer's Codex AI Credits"
CREDIT_PACKS=(
  "single|1|199|1 AI Credit"
  "five|5|699|5 AI Credits"
  "twenty|20|1999|20 AI Credits"
)

say() { printf '\n\033[1m== [%s] %s ==\033[0m\n' "$MODE" "$1"; }
die() { printf '\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

command -v stripe >/dev/null || die "stripe CLI not found. brew install stripe/stripe-cli/stripe"

say "Verifying $MODE access"
if ! stripe products list $FLAG --limit 1 >/dev/null 2>&1; then
  die "$MODE API not accessible. Either 'stripe login' isn't done, or (live only)
  the account isn't activated for live payments yet."
fi
echo "$MODE API reachable."

say "Find-or-create product: $PRODUCT_NAME"
PROD_ID=$(stripe products list $FLAG --limit 100 \
  | jq -r --arg n "$PRODUCT_NAME" '.data[] | select(.name==$n and .active==true) | .id' | head -1)
if [ -z "$PROD_ID" ]; then
  PROD_ID=$(stripe products create $FLAG \
    -d "name=$PRODUCT_NAME" \
    -d "description=Premium Pack — 5 AI generations per kind each month, plus all premium poster styles, merch designs, and 3D HOME sprites." \
    | jq -r '.id')
  echo "Created product: $PROD_ID"
else
  echo "Reusing product: $PROD_ID"
fi

say "Find-or-create price: \$4.99/mo recurring"
PRICE_ID=$(stripe prices list $FLAG --product "$PROD_ID" --limit 100 \
  | jq -r --argjson amt "$PRICE_AMOUNT" --arg cur "$PRICE_CURRENCY" \
    '.data[] | select(.active==true and .unit_amount==$amt and .currency==$cur and .recurring.interval=="month") | .id' | head -1)
if [ -z "$PRICE_ID" ]; then
  PRICE_ID=$(stripe prices create $FLAG \
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

say "Find-or-create price: \$39/yr recurring (annual)"
PRICE_ANNUAL_ID=$(stripe prices list $FLAG --product "$PROD_ID" --limit 100 \
  | jq -r --argjson amt "$PRICE_ANNUAL_AMOUNT" --arg cur "$PRICE_CURRENCY" \
    '.data[] | select(.active==true and .unit_amount==$amt and .currency==$cur and .recurring.interval=="year") | .id' | head -1)
if [ -z "$PRICE_ANNUAL_ID" ]; then
  PRICE_ANNUAL_ID=$(stripe prices create $FLAG \
    -d "product=$PROD_ID" \
    -d "unit_amount=$PRICE_ANNUAL_AMOUNT" \
    -d "currency=$PRICE_CURRENCY" \
    -d "recurring[interval]=year" \
    -d "nickname=Premium Pack Annual" \
    | jq -r '.id')
  echo "Created annual price: $PRICE_ANNUAL_ID"
else
  echo "Reusing annual price: $PRICE_ANNUAL_ID"
fi

say "Find-or-create product: $CREDITS_PRODUCT_NAME"
CREDITS_PROD_ID=$(stripe products list $FLAG --limit 100 \
  | jq -r --arg n "$CREDITS_PRODUCT_NAME" '.data[] | select(.name==$n and .active==true) | .id' | head -1)
if [ -z "$CREDITS_PROD_ID" ]; then
  CREDITS_PROD_ID=$(stripe products create $FLAG \
    -d "name=$CREDITS_PRODUCT_NAME" \
    -d "description=One-time AI generation credits. Each credit makes one AI image (trainer card, team art, or codex card)." \
    | jq -r '.id')
  echo "Created credits product: $CREDITS_PROD_ID"
else
  echo "Reusing credits product: $CREDITS_PROD_ID"
fi

# Provision the three one-time credit-pack prices. Each carries its credit count
# in price metadata so the pack is self-describing in the Dashboard.
declare -a CREDIT_PRICE_OUT
for entry in "${CREDIT_PACKS[@]}"; do
  IFS='|' read -r pack credits cents nickname <<<"$entry"
  say "Find-or-create credit price: \$$(printf '%.2f' "$(echo "$cents/100" | bc -l)") → $credits credits ($pack)"
  CP_ID=$(stripe prices list $FLAG --product "$CREDITS_PROD_ID" --limit 100 \
    | jq -r --argjson amt "$cents" --arg cur "$PRICE_CURRENCY" \
      '.data[] | select(.active==true and .unit_amount==$amt and .currency==$cur and (.recurring|not)) | .id' | head -1)
  if [ -z "$CP_ID" ]; then
    CP_ID=$(stripe prices create $FLAG \
      -d "product=$CREDITS_PROD_ID" \
      -d "unit_amount=$cents" \
      -d "currency=$PRICE_CURRENCY" \
      -d "nickname=$nickname" \
      -d "metadata[pack]=$pack" \
      -d "metadata[credits]=$credits" \
      | jq -r '.id')
    echo "Created credit price ($pack): $CP_ID"
  else
    echo "Reusing credit price ($pack): $CP_ID"
  fi
  CREDIT_PRICE_OUT+=("$pack=$CP_ID")
done

say "Find-or-create webhook endpoint → $WEBHOOK_URL"
EXISTING_WH=$(stripe webhook_endpoints list $FLAG --limit 100 \
  | jq -r --arg u "$WEBHOOK_URL" '.data[] | select(.url==$u) | .id' | head -1)
WH_SECRET=""
if [ -z "$EXISTING_WH" ]; then
  # shellcheck disable=SC2086
  CREATE_OUT=$(stripe webhook_endpoints create $FLAG \
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

say "RESULTS ($MODE)"
echo "STRIPE_PRICE_ID=$PRICE_ID"
echo "STRIPE_PRICE_ANNUAL=$PRICE_ANNUAL_ID"
for kv in "${CREDIT_PRICE_OUT[@]}"; do
  pack="${kv%%=*}"; pid="${kv#*=}"
  case "$pack" in
    single) echo "STRIPE_PRICE_CREDITS_1=$pid" ;;
    five)   echo "STRIPE_PRICE_CREDITS_5=$pid" ;;
    twenty) echo "STRIPE_PRICE_CREDITS_20=$pid" ;;
  esac
done
if [ -n "$WH_SECRET" ]; then
  echo "STRIPE_WEBHOOK_SECRET=$WH_SECRET"
fi

# Emit machine-readable lines the deploy automation can parse.
{
  echo "MODE=$MODE"
  echo "PRICE_ID=$PRICE_ID"
  echo "PRICE_ANNUAL=$PRICE_ANNUAL_ID"
  for kv in "${CREDIT_PRICE_OUT[@]}"; do
    pack="${kv%%=*}"; pid="${kv#*=}"
    case "$pack" in
      single) echo "PRICE_CREDITS_1=$pid" ;;
      five)   echo "PRICE_CREDITS_5=$pid" ;;
      twenty) echo "PRICE_CREDITS_20=$pid" ;;
    esac
  done
  echo "WEBHOOK_ID=$WH_ID"
  [ -n "$WH_SECRET" ] && echo "WEBHOOK_SECRET=$WH_SECRET"
} > "/tmp/stripe-${MODE}-result.env"

say "Saved → /tmp/stripe-${MODE}-result.env"
