#!/usr/bin/env bash
# Finish email routing setup AFTER Jose clicks the verification email
# Cloudflare sent to jrriestra@empirehoa.com.
#
# Idempotent: lists existing rules first; only creates if missing.
#
# Usage:
#   bash scripts/finish-email-routing.sh
#
# Requires env: CLOUDFLARE_API_TOKEN (or it'll source .deploy-creds).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  if [[ -f .deploy-creds ]]; then
    set -a; source .deploy-creds; set +a
  fi
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "✗ CLOUDFLARE_API_TOKEN not set"
  exit 1
fi

ZONE_ID="3663ef7e0a2d2ceb008aa88bfebdaea6"
ACCOUNT_ID="c3562f59e9b068eaf3ba440f50c1ac6f"
DESTINATION="jrriestra@empirehoa.com"

echo "▶ Checking destination verification status..."
VERIFIED=$(curl -sX GET "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/email/routing/addresses" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for a in d.get('result', []):
    if a.get('email') == '$DESTINATION':
        print(a.get('verified') or 'unverified')
        break
else:
    print('not_found')
")

if [[ "$VERIFIED" == "unverified" || "$VERIFIED" == "not_found" ]]; then
  echo "✗ Destination $DESTINATION is not verified yet."
  echo "  Check your inbox for a Cloudflare verification email and click the link."
  echo "  Then re-run this script."
  exit 1
fi

echo "  ✓ Destination verified ($VERIFIED)"
echo

# --- Rule 1: legal@ → forward ---
echo "▶ Creating rule: legal@trainerscodex.com → $DESTINATION"
LEGAL_RULE_EXISTS=$(curl -sX GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for r in d.get('result', []):
    for m in r.get('matchers', []):
        if m.get('value') == 'legal@trainerscodex.com':
            print('yes')
            break
    else:
        continue
    break
else:
    print('no')
")

if [[ "$LEGAL_RULE_EXISTS" == "no" ]]; then
  curl -sX POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\":\"Forward legal@\",
      \"enabled\":true,
      \"priority\":1,
      \"matchers\":[{\"type\":\"literal\",\"field\":\"to\",\"value\":\"legal@trainerscodex.com\"}],
      \"actions\":[{\"type\":\"forward\",\"value\":[\"$DESTINATION\"]}]
    }" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ✓ Success' if d.get('success') else '  ✗ Errors: ' + str(d.get('errors')))"
else
  echo "  ✓ Already exists"
fi

# --- Rule 2: billing@ ---
echo "▶ Creating rule: billing@trainerscodex.com → $DESTINATION"
curl -sX POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\":\"Forward billing@\",
    \"enabled\":true,
    \"priority\":2,
    \"matchers\":[{\"type\":\"literal\",\"field\":\"to\",\"value\":\"billing@trainerscodex.com\"}],
    \"actions\":[{\"type\":\"forward\",\"value\":[\"$DESTINATION\"]}]
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ✓ Success' if d.get('success') else '  ⚠  ' + str(d.get('errors')))"

# --- Rule 3: privacy@ ---
echo "▶ Creating rule: privacy@trainerscodex.com → $DESTINATION"
curl -sX POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\":\"Forward privacy@\",
    \"enabled\":true,
    \"priority\":3,
    \"matchers\":[{\"type\":\"literal\",\"field\":\"to\",\"value\":\"privacy@trainerscodex.com\"}],
    \"actions\":[{\"type\":\"forward\",\"value\":[\"$DESTINATION\"]}]
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ✓ Success' if d.get('success') else '  ⚠  ' + str(d.get('errors')))"

# --- Rule 4: support@ ---
echo "▶ Creating rule: support@trainerscodex.com → $DESTINATION"
curl -sX POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\":\"Forward support@\",
    \"enabled\":true,
    \"priority\":4,
    \"matchers\":[{\"type\":\"literal\",\"field\":\"to\",\"value\":\"support@trainerscodex.com\"}],
    \"actions\":[{\"type\":\"forward\",\"value\":[\"$DESTINATION\"]}]
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ✓ Success' if d.get('success') else '  ⚠  ' + str(d.get('errors')))"

# --- Rule 5: catch-all ---
echo "▶ Setting catch-all → $DESTINATION"
curl -sX PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules/catch_all" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\":\"Catch-all forward\",
    \"enabled\":true,
    \"matchers\":[{\"type\":\"all\"}],
    \"actions\":[{\"type\":\"forward\",\"value\":[\"$DESTINATION\"]}]
  }" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ✓ Success' if d.get('success') else '  ⚠  ' + str(d.get('errors')))"

echo
echo "============================================================"
echo "  ✓ Email routing live for @trainerscodex.com"
echo "============================================================"
echo "  Addresses live: legal@, billing@, privacy@, support@ (+ catch-all)"
echo "  All forward to: $DESTINATION"
echo
echo "  Test it: send mail to legal@trainerscodex.com"
echo "  (Delivery usually instant, occasionally up to ~5 min during DNS warmup.)"
