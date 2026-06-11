# Printful Setup — Trainer's Codex

Single source of truth for wiring the **`POST /printful/order`** endpoint to a
live Printful store. The integration code (`worker/src/printful.ts`) is already
written and deployed; **it returns `503 printful_not_configured` until the one
secret below is set.** No local API key is needed — every step here is run by
Jose against the live Worker.

> The store id is already baked in: `PRINTFUL_STORE_ID = "18253803"` in
> `worker/wrangler.toml`. The product → variant map is fully populated for all
> 12 SKUs (`PRINTFUL_VARIANT_MAP`). The only missing piece is the API token and
> the public URL the design PNGs are served from.

---

## What the endpoint does (so you know what you're enabling)

When a buyer clicks "Order on Printful", the browser POSTs the print-ready PNG
to the Worker, which then:

1. Stashes the PNG in the R2 bucket (`trainerscodex`) under `prints/<uuid>.png`.
2. Serves it via a **public** URL (`https://cdn.trainerscodex.com/prints/…`).
3. Uploads that URL to Printful's file library (`POST /files`).
4. Creates a Printful **sync product** with the variant + retail price (base
   cost × markup) and returns the dashboard URL for the seller.

Step 2 is the hidden dependency: **Printful must be able to fetch the design
over HTTPS**, so the R2 bucket needs a public domain. If `cdn.trainerscodex.com`
isn't wired, the `/files` upload fails.

---

## 1. Create the Printful API token  (≈ 3 min — Jose)

1. Log in at https://www.printful.com/dashboard (store **18253803**).
2. Go to **Settings → Stores → [your store] → API**, or directly to
   **Developers → API Tokens** → **Add new token**.
3. Grant these scopes (read+write):
   - **File library** (`/files`)
   - **Sync products** (`/sync/products`)
   - **Products / Catalog** (read)
   - **Orders** (read — for later order-status polling)
4. Copy the token once (it's shown a single time). It looks like a long
   opaque string, not a `pk_`/`sk_` prefix.

## 2. Push the token to the Worker  (≈ 1 min — Jose)

From the repo root:

```bash
cd worker
wrangler secret put PRINTFUL_API_KEY
# paste the token at the prompt, press enter
```

That's the whole "no local key" answer: the token never touches the repo or
your laptop's env — it's stored encrypted on the Worker.

## 3. Make the R2 bucket public so Printful can fetch designs  (≈ 5 min — Jose)

The bucket `trainerscodex` already exists and is bound (`PRINTS_BUCKET`). It
needs a public hostname:

1. Cloudflare Dashboard → **R2 → `trainerscodex` → Settings → Public access**.
2. Either:
   - **Connect a custom domain** `cdn.trainerscodex.com` (recommended — matches
     the code default `PRINTS_PUBLIC_BASE`), **or**
   - Enable the **r2.dev** public URL and then set the override var in
     `worker/wrangler.toml`:
     ```toml
     [vars]
     PRINTS_PUBLIC_BASE = "https://pub-<hash>.r2.dev"
     ```
3. If you used the custom domain, add the DNS record (CF will offer one-click)
   and confirm `https://cdn.trainerscodex.com/` resolves.

## 4. Redeploy the Worker  (≈ 1 min — Jose)

```bash
cd worker
wrangler deploy
```

Secrets and the public-base var take effect on the next deploy.

## 5. Smoke test  (≈ 2 min)

```bash
# Expect 200 with { storeUrl, dashboardUrl, productName, externalId, retail }.
# (Use a real PNG; the endpoint rejects files > 12 MB and unknown products.)
curl -sS -X POST https://trainers-codex-api.jrriestra.workers.dev/printful/order \
  -F product=tshirt-bella-3001 \
  -F design=crest \
  -F markup=100 \
  -F 'metadata={"teamName":"Kanto Classics","trainer":"Prof Oak"}' \
  -F file=@/path/to/print.png | jq
```

Then in the app: build a team → Merch Studio → pick a tee → **Order on
Printful** → you should be handed the Printful dashboard listing.

---

## Failure modes & what they mean

| Symptom | Cause | Fix |
|---|---|---|
| `503 printful_not_configured` | `PRINTFUL_API_KEY` not set | Step 2 |
| `printful_401` / `printful_403` | Token wrong scopes or wrong store | Re-issue token with the scopes in Step 1 |
| `printful_400` on `/files` | Design URL not publicly reachable | Step 3 — R2 public domain |
| `unknown_product` (400) | App sent a product id not in `PRINTFUL_VARIANT_MAP` | Add the SKU to `worker/src/printful.ts` |
| `file_too_large` (413) | PNG > 12 MB | Lower the export DPI in the renderer |

---

## Status (2026-06-11)

- [x] Integration code written + deployed (`worker/src/printful.ts`)
- [x] Store id set (`18253803`) and full 12-SKU variant map
- [x] R2 bucket `trainerscodex` created + bound (`PRINTS_BUCKET`)
- [ ] **`PRINTFUL_API_KEY` secret** — Jose, Step 2
- [ ] **`cdn.trainerscodex.com` public R2 domain** — Jose, Step 3
- [ ] Redeploy + smoke test — Steps 4–5
