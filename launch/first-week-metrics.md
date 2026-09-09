# First-week metrics plan — "is the funnel working?"

Two anonymous, RLS-protected event tables in Supabase project
`obcrhdmpkvwntwqyixls` receive fire-and-forget inserts from the client
(`src/journey/analytics.ts`, `src/lib/commerce-analytics.ts`). No PII: a random
per-browser `session_id` (localStorage UUID), the event name, a small `props`
JSON, and `created_at`. Read them with the Supabase SQL editor or the
Supabase MCP (`execute_sql`) — the anon key cannot SELECT; use the dashboard.

## Vocabularies (must match the DB CHECK constraints exactly — they do as of v1.0-launch)

`journey_events.event`: `run_started` · `run_completed` · `run_abandoned` ·
`share_attempted` · `builder_handoff` · `merch_cta_click` · `daily_played`

`commerce_events.event`: `paywall_shown` · `checkout_started` ·
`purchase_completed` · `credits_purchased` · `license_restored` ·
`license_revoked` · `merch_render_started` · `merch_order_submitted`

`props.surface` on `paywall_shown` / `checkout_started`: `ai-studio` ·
`poster-style` · `sprite-variant` · `saved-teams` · `journey-archive` ·
`journey-saves` · `legend-finish` · `merch-studio` · `header` · `other`
(`CommerceSurface` in `src/lib/commerce-analytics.ts`).

> `checkout_started` fires when the client receives a Stripe Checkout URL.
> `purchase_completed` fires when `/stripe/verify` returns a license after the
> return redirect. There is no client event for "cancelled at Stripe"
> (`checkout_abandoned` is intentionally not in the vocabulary); abandonment =
> `checkout_started − purchase_completed` per session.

## The five questions, one query each

### Q1 — Are people arriving and playing? (daily actives, runs, completion rate)

```sql
select
  date_trunc('day', created_at)                                   as day,
  count(distinct session_id)                                       as sessions,
  count(*) filter (where event = 'run_started')                    as runs_started,
  count(*) filter (where event = 'run_completed')                  as runs_completed,
  round(100.0 * count(*) filter (where event = 'run_completed')
        / nullif(count(*) filter (where event = 'run_started'), 0), 1) as completion_pct,
  count(*) filter (where event = 'daily_played')                   as dailies,
  count(*) filter (where event = 'share_attempted')                as shares
from journey_events
where created_at >= now() - interval '7 days'
group by 1 order by 1;
```
Healthy week 1: completion ≥ 45%; shares/completed ≥ 10%. Below that, the
retired screen or the card is the problem, not acquisition.

### Q2 — Where do runs die? (abandonment by state and chapter)

```sql
select props->>'state' as state,
       (props->>'chapters')::int as chapters,
       count(*) as abandoned
from journey_events
where event = 'run_abandoned' and created_at >= now() - interval '7 days'
group by 1, 2 order by 3 desc limit 20;
```

### Q3 — Is the paywall being seen, and by which surface? (top of the commerce funnel)

```sql
select props->>'surface' as surface,
       count(*)                          as paywall_views,
       count(distinct session_id)        as unique_sessions
from commerce_events
where event = 'paywall_shown' and created_at >= now() - interval '7 days'
group by 1 order by 2 desc;
```

### Q4 — Paywall → checkout → purchase conversion (the number that matters)

```sql
with f as (
  select session_id,
         bool_or(event = 'paywall_shown')                                   as saw_paywall,
         bool_or(event = 'checkout_started' and props->>'plan' = 'premium') as started,
         bool_or(event = 'purchase_completed')                              as purchased,
         max(props->>'term') filter (where event = 'purchase_completed')    as term
  from commerce_events
  where created_at >= now() - interval '7 days'
  group by session_id
)
select
  count(*) filter (where saw_paywall)                        as sessions_saw_paywall,
  count(*) filter (where started)                            as sessions_started_checkout,
  count(*) filter (where purchased)                          as sessions_purchased,
  round(100.0 * count(*) filter (where started)   / nullif(count(*) filter (where saw_paywall), 0), 2) as paywall_to_checkout_pct,
  round(100.0 * count(*) filter (where purchased) / nullif(count(*) filter (where started), 0), 2)     as checkout_to_purchase_pct,
  count(*) filter (where purchased and term = 'annual')      as annual,
  count(*) filter (where purchased and term = 'monthly')     as monthly
from f;
```
Until the live Stripe keys are set (owner blocker #1) every `purchase_completed`
here is a **test-mode** purchase — treat week-1 conversion as a UX signal, not
revenue. Cross-check purchases against the Stripe dashboard count; a gap means
the return-redirect/verify path is losing people.

### Q5 — How do runs start, and does Journey feed the builder?

`props.source` on `run_started` is `fresh` | `seed-link` | `daily` (shared
seed links and the daily are the viral loops); `builder_handoff` marks
Journey → builder. **Gap:** `?q=` arrivals from the 1,330 reference pages are
not tracked as an event today — read that funnel from Search Console clicks
and Cloudflare Web Analytics referrers instead, or add a `source: 'seo'` value
to `RunSource` in a follow-up (it must also be added to the DB CHECK if one
exists on `props`; currently only `event` is constrained).

```sql
select props->>'source' as source,
       count(*) filter (where event = 'run_started')  as runs,
       count(*) filter (where event = 'run_completed') as completed
from journey_events
where created_at >= now() - interval '7 days'
group by 1 order by 2 desc;

select count(*) as builder_handoffs
from journey_events
where event = 'builder_handoff' and created_at >= now() - interval '7 days';
```

## Guardrail queries (run daily, week 1)

**Revocations vs purchases** — cancellations that are actually revoking:
```sql
select event, count(*) from commerce_events
where event in ('purchase_completed','license_restored','license_revoked')
  and created_at >= now() - interval '7 days'
group by 1;
```

**Merch must be dark** — any of these rows before counsel clears merch is a bug:
```sql
select event, count(*) from commerce_events
where event in ('merch_render_started','merch_order_submitted')
  and created_at >= now() - interval '7 days' group by 1;
select count(*) as merch_cta_clicks from journey_events
where event = 'merch_cta_click' and created_at >= now() - interval '7 days';
```
(`merch_render_started` fires on "download print PNG", which is allowed;
`merch_order_submitted` must be **zero** while `MERCH_CHECKOUT` is off — the
worker now rejects it with 503 `merch_disabled` even if the client flag is
flipped via `?ff=`.)

**Event volume sanity** — a sudden 10× in one session is a bot or a bug:
```sql
select session_id, count(*) n from journey_events
where created_at >= now() - interval '1 day'
group by 1 order by 2 desc limit 5;
```

## Outside the DB (owner dashboards)

- Stripe → Payments (test vs live), Subscriptions → churn after day 30.
- Cloudflare → Workers → `trainers-codex-api` requests, errors, 4xx/5xx split
  (a spike in 403 on `/ai/*` = revocation working; 503 `merch_disabled` = someone
  found the `?ff=` flag — harmless).
- Cloudflare → Web Analytics for the zone (cookieless; CSP now allows the beacon).
- Search Console → Performance (impressions start ~day 3–7 after sitemap submit).

## Definition of "the funnel is working" (week 1)

1. ≥ 200 unique sessions with a `run_started` (else it's a distribution problem).
2. Completion ≥ 45%, shares/completed ≥ 10%.
3. `paywall_shown` on ≥ 20% of sessions (people are finding the premium surfaces).
4. paywall→checkout ≥ 3% and checkout→purchase ≥ 40% (test mode counts as a
   UX pass; revenue only after blocker #1).
5. Zero `merch_order_submitted`; zero rows with anything resembling PII in `props`.
