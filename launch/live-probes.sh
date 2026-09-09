#!/bin/sh
# Owner re-run: 12 read-only probes, ~1 req/s. Expected results in findings/B.json B-13.
API=https://trainers-codex-api.jrriestra.workers.dev
NONE_JWT=$(node -e 'const b=s=>Buffer.from(JSON.stringify(s)).toString("base64url");const now=Math.floor(Date.now()/1000);console.log(b({alg:"none",typ:"JWT"})+"."+b({iss:"trainerscodex.com",sub:"x",email:"a@b.c",plan:"premium",stripe_session:"cs_test_x",iat:now,exp:now+9999})+".")')
p(){ echo; echo "\$ $*"; "$@"; sleep 1.1; }
p curl -sS -i -m 10 "$API/health"
p curl -sS -i -m 10 "$API/"
p curl -sS -i -m 10 -X OPTIONS -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST' "$API/stripe/checkout"
p curl -sS -i -m 10 -X OPTIONS -H 'Origin: https://trainerscodex.com' -H 'Access-Control-Request-Method: POST' "$API/stripe/checkout"
p curl -sS -i -m 10 -H 'Origin: https://evil.example' "$API/health"
p curl -sS -i -m 10 -H 'Origin: https://trainerscodex.com' "$API/health"
p curl -sS -i -m 10 -X POST -H 'Origin: https://trainerscodex.com' -H 'content-type: application/json' --data '' "$API/stripe/checkout"
p curl -sS -i -m 10 -X POST -H 'Origin: https://trainerscodex.com' -H 'content-type: application/json' --data "{\"jwt\":\"$NONE_JWT\"}" "$API/license/verify"
p curl -sS -i -m 10 -X POST -H 'Origin: https://trainerscodex.com' -H 'content-type: application/json' --data 'null' "$API/stripe/verify"
p curl -sS -i -m 10 -X POST -H 'Origin: https://trainerscodex.com' -H 'content-type: multipart/form-data; boundary=x' -H 'Content-Length: 13631488' "$API/merch/checkout"
p curl -sS -i -m 10 -X POST -H 'Origin: https://trainerscodex.com' -H 'content-type: application/json' --data '{}' "$API/merch/checkout"
p curl -sS -i -m 10 -X POST -H 'content-type: application/json' --data '{"type":"x"}' "$API/stripe/webhook"
