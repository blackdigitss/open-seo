# Decisions

The adjudicated plan for this fork and the paper trail behind it. Each decision
was drafted, attacked by three independent reviewers (simplicity, domain risk,
product/ops), and then accepted or overridden here. When a decision looks odd,
the log at the bottom says why it stands.

Dates are absolute. Last adjudication: 2026-09-05.

## Verified facts

Checked against the code, `node_modules`, the Cloudflare API, and live HTTP
probes — not assumed.

- **F1.** TanStack Start on Cloudflare Workers; D1 with a mirrored Postgres
  schema and a parity test; file-based routes under `src/routes/`; a git-tracked
  `src/routeTree.gen.ts`; crons `*/5 * * * *` and `17 3 * * *` handled in
  `src/server.ts`; MCP tool registry in `src/server/mcp/server.ts`; nav in
  `src/client/navigation/items.ts`; mobile shell in
  `src/client/layout/AppShell.tsx`.
- **F2.** GSC search analytics are fetched live (dims: query, page, country,
  device, date), never persisted; GSC data lags 3 days; 16-month retention.
  GA4 pulls `sessions`, `keyEvents`, `purchaseRevenue`, `engagedSessions`,
  `landingPage`, `sessionDefaultChannelGroup`.
- **F3.** Opportunity scoring already exists:
  `SearchOpportunityService.getOpportunities` (GSC pos 4–20 joined to GA4
  landing pages, percentile-ranked demand × business value × reachability,
  with a fallback when conversions are all zero) and
  `buildStrikingDistanceRows` (GSC Insights page). Exposed to SAM as
  `get_search_opportunities`.
- **F4.** Site audit persists title/meta/canonical/robots/headings/word
  count/`contentHash` per page but never page text or link edges (spec 0009);
  `src/server/lib/scrape.ts` reads at most 5 pages.
- **F5.** Project memory (spec 0010): typed context sections, competitors, key
  pages with role `hub|spoke|money|other`, research log.
- **F6.** Self-host mode discards every DataForSEO cost record
  (`src/server/lib/dataforseo/client.ts:151`); `fetchUserData()` reads account
  balance and day-spend for free. No email transport exists outside hosted
  mode (`src/server/email/loops.ts`).
- **F7.** Upstream accepts issues, not PRs (`docs/CONTRIBUTING.md`). Open
  upstream issues overlapping this plan: #208 rank alerts, #209 client reports,
  #268 cost dashboard, #292 cron scheduling, #231 IndexNow, #242 CrUX, #266
  brand lookups not persisted, #226 self-host deploy deletes hand-attached
  custom domains. ~177 upstream commits in 60 days; hot files include
  `package.json` (26), both drizzle journals (15–16), `mcp/server.ts` (12),
  `alchemy.run.ts` (10), `server.ts` (8), `src/db/schema.ts` (8);
  `navigation/items.ts` (1) and `__root.tsx` (2) are cold.
- **F8.** Migrations: the self-host deploy applies D1 migrations through
  alchemy's single `migrationsDir: "drizzle"`, recursively, tracked by relative
  filename; numeric-prefixed files sort first, others after. Wrangler's local
  apply is non-recursive. Neither reads `drizzle/meta/_journal.json`.
- **F9.** CI runs `knip` with an explicit entry list, and a lean-bundle Vite
  plugin fails the build if heavy SDKs (e.g. `@ai-sdk/anthropic`) enter the
  eager import graph.
- **F10.** Owner's sites: `walkersnotary.com` is a Cloudflare Pages project
  (direct upload, not git-connected). `www.robynashleyweddings.com` is an Astro
  site served by a Worker on the same account (no `cf-cache-status`, apex 301s
  to www); its A records are stale and irrelevant. Both zones are
  Cloudflare-proxied. The API token has no Zero Trust scope and its zone
  Workers-Routes permission is unverified.
- **F11.** Manifest is linked without `crossOrigin="use-credentials"`, so behind
  Cloudflare Access the manifest fetch is redirected to login. Whether an
  installed iOS PWA can complete an Access re-login in standalone mode is
  unverified by any vendor doc.

## Constraints

- **C1.** Upstream merges stay cheap: our code lives under `src/custom/**`,
  `src/db/custom/**`, `drizzle/custom/**`, thin route files, and a separate
  scheduled Worker; `// FORK:` hooks in upstream files are few, in cold files,
  and listed in `FORK.md`.
- **C2.** Every custom table has a D1 and a Postgres schema and a parity test
  of our own.
- **C3.** DataForSEO is pay-per-call. Free sources (GSC, GA4, own crawl) first;
  every scheduled paid pull runs under a cap.
- **C4.** Mobile must feel native: installable, push, thumb-first.
- **C5.** Small-business scale (10–50 pages, tens of leads a month).
  Statistics are honest at that scale or absent.
- **C6.** Build for the owner's sites first; keep the shape sellable.

## Decisions

### The product

- **D1. The unit is a Move.** One `moves` table. A Move is a fix or an
  opening, with: `type`, `project_id`, `target_url`, `target_query`,
  `hypothesis` (one line), `evidence` (the GSC/audit rows that produced it),
  `before`, `after`, `draft` (the copy or snippet, generated at creation in the
  project's `writing_preferences` voice), `why_safe`, `risk_tier`, `score`,
  `score_inputs`, `verify_url`, `revert`, `status`, `applied_at`,
  `review_at`, `verdict`. A Move without a draft is a to-do list item, which
  the owner already has.
- **D2. Ranking is ordinal within a site and money-aware across sites.**
  Within a site: the existing percentile formula plus a one-line reason.
  Across sites: multiplied by one site multiplier = value-per-lead × close
  rate × site conversion rate, owner-entered in project context with a
  default. Dollars appear only as three buckets (`<$50`, `$50–250`, `>$250`
  per month) with the assumptions captioned. Never a per-Move dollar range.
  `purchaseRevenue` from GA4 is the only thing called revenue.
- **D3. Openings come from the existing service.** Nightly, call
  `SearchOpportunityService.getOpportunities` and `buildStrikingDistanceRows`
  and write the top N as Moves. No new scoring code.
- **D4. Decay watch** compares trailing 28 days to the prior 28 and to the
  same window last year, per page, from GSC. Flag only when both windows have
  ≥30 clicks; otherwise roll up to site level. Staleness: pages whose
  `contentHash` is unchanged for 12+ months or that contain stale years or
  prices. Seasonality comes from last year's GSC curve, not a paid trends
  call.
- **D5. Delivery is a Monday plan plus event pushes, never a daily "nothing
  changed".** Monday: ranked Moves, verdicts due, spend. Events: a money query
  leaves the top 10 with ≥100 impressions, a new GBP review, a review date
  reached, a verification crawl fails, budget at 80%. Transport is Telegram
  first (works on the phone today and sidesteps F11); Web Push in the mobile
  phase.
- **D6. The apply loop, not an edge rewriter, is the first write path.** A
  Move renders a copy-ready snippet (title, meta, JSON-LD, alt, redirect rule)
  — for `walkersnotary.com` optionally the patched file — with **Done**, which
  stamps `applied_at`, schedules a verification crawl of that URL the next
  morning, and pings IndexNow.
- **D7. Verdicts are before/after.** At `review_at`: 28 days after vs 28
  before, with last year's line drawn, pushed to the owner.
  Difference-in-differences bands and split tests only after 20 applied Moves
  exist.
- **D8. Mobile is the approval surface.** Service worker (network-first
  navigations; never cache an Access redirect or the login page), Web Push
  via WebCrypto VAPID (no new dependency), bottom tab bar positioned from the
  root hook, one-thumb Done/Skip. Gated on the P0 spike in D16.
- **D9. Intelligence on a budget, in this order:** cost recording, weekly
  rank tracking at depth 20, monthly brand-lookup snapshot persisted, weekly
  GBP reviews, grid history, monthly competitor keyword-gap diff, monthly
  brand search-volume trend. Topical coverage is produced on demand by SAM's
  existing skills until usage justifies persisting a matrix. DataForSEO
  `content_analysis` is probed once with the free credit before anything
  schedules it. TikTok is out — no viable source.
- **D10. Internal-link suggestions and a persisted link graph wait for a site
  with more than 30 pages.** Until then, the audit's orphan and broken-link
  issues become Moves.
- **D11. The edge layer is a triggered phase, not a scheduled one.** Built
  when a site arrives without edit access (a customer), when rule changes
  exceed one a month, or when split tests are wanted. Its design is fixed now
  (see "Edge layer design" below) so it is ready when triggered.

### Engineering

- **D12. Scheduled work runs in a separate Worker**, `wrangler.custom.jsonc` +
  `src/custom/worker.ts`, deployed with plain `wrangler deploy`, binding the
  same D1 and KV ids the app uses (the audit Worker is the precedent). This
  keeps `server.ts`, `wrangler.jsonc`, and `alchemy.run.ts` untouched. Jobs
  tick off a 5-minute cron with a `custom_job_runs` ledger.
- **D13. Custom tables live in `src/db/custom/*.schema.ts` with a Postgres
  mirror and their own parity test.** They are never re-exported from
  upstream's schema barrels. Repositories import them directly.
- **D14. Custom migrations live in `drizzle/custom/NNNN_*.sql`** generated by
  `drizzle-custom.config.ts` with its own journal. Alchemy applies them after
  upstream's with no edit. Local dev applies them with
  `wrangler d1 migrations apply -c wrangler.custom.jsonc` (documented, not
  chained into `package.json`).
- **D15. Hooks in upstream files, in full:** `navigation/items.ts` (nav
  entries), `__root.tsx` (manifest `crossOrigin`, service-worker
  registration, tab bar mount), `knip.jsonc` (entry for the custom Worker),
  and — only when scheduled paid pulls ship —
  `src/server/lib/dataforseo/client.ts` (one line in the self-host branch
  recording `{path, costUsd, feature, projectId}`). Every hook is a dynamic
  `import("@/custom/...")` so custom code stays out of the eager bundle. A
  hook in `mcp/server.ts` is deferred; if added, it goes at the top of the
  register list because upstream appends at the bottom.
- **D16. LLM calls use OpenRouter with an `anthropic/` model slug through the
  existing `buildChatAgentModel`.** No second provider, no SDK import.
- **D17. Sync against upstream tags, not Monday HEAD**, and regenerate
  `routeTree.gen.ts` rather than merge it. Expected cost: 30–60 minutes per
  sync; half a day when upstream moves a seam.
- **D18. Stay on `workers.dev` for the app URL** until a custom domain is
  worth a `// FORK:` edit to `alchemy.run.ts` (#226).
- **D19. Contribute upstream through issues**, with a POC branch linked as
  reference. Never PRs.
- **D20. Sellability now costs only this:** every custom table carries
  `project_id` and goes through `getProjectForOrganization`; projects store
  their zone and account ids; one `src/custom/llm.ts` seam.

### Edge layer design (fixed now, built when triggered)

One Worker with multi-zone routes. Rules are authored in the app and stored
in D1; the app publishes a per-host rule snapshot plus a kill flag to KV;
the Worker reads KV only. Buffer the origin HTML, transform inside try/catch,
return the untouched origin response on any exception; pass origin 5xx
through unchanged; delete `content-length` and `content-encoding`. Safe tier
is additive or same-intent replacement only: title text, meta description,
alt text, JSON-LD merged by `@type`, a self-canonical when absent, `llms.txt`.
Risky tier — approval required — is anything that can remove a page from
the index: `noindex`, `nofollow`, a canonical to another URL, any redirect,
any change on a money page. Rules never key on user agent, bot headers, or
`cf-*` headers; the canary diffs Googlebot-UA and Chrome-UA output
byte-for-byte and passes when the rendered-DOM diff equals the rule's
expected diff with zero exceptions. Asset paths get no-script opt-out routes.
Never cache rewritten HTML; strip `If-None-Match` / `If-Modified-Since` on
the origin subrequest. Preconditions before the first route: inventory
`/zones/{id}/workers/routes` and `/accounts/{id}/workers/domains` for each
zone (the officiant site is already Worker-served — the SEO layer may need
to merge into that Worker rather than route in front of it), and confirm the
token holds zone-level Workers Routes Edit.

## Sequence

- **P0 — Unblock (owner, about an hour; me, zero app code).** Owner: the
  Cloudflare Access OAuth login; DataForSEO key and the $50 minimum top-up;
  a Google Cloud OAuth client for GSC/GA4 on both sites; `OPENROUTER_API_KEY`;
  a Telegram bot token; and the spike — install the deployed app to an iPhone
  home screen from Safari, let the session expire, confirm re-login completes
  in standalone mode. Me: a scheduled agent job that calls the MCP tools and
  posts the Monday plan and event bullets to Telegram. The briefing runs this
  week, and shows what the owner actually acts on before a line of app code
  exists.
- **P1 (weeks 1–2) — Moves, home, delivery.** D1, D2, D3, D4, D5, D12, D13,
  D14, D15. Nightly append of GSC page×date and page×query×date. Portfolio
  home at `/` replacing the redirect.
- **P2 (week 3) — Apply loop.** D6.
- **P3 (weeks 4–5) — Mobile.** D8, gated on the P0 spike; Telegram stays the
  fallback.
- **P4 (weeks 6–8) — Intelligence on a budget.** D9, D10's Move producers,
  cost recording, caps: $25/month portfolio hard stop for scheduled work,
  $10/month per project soft.
- **P5 (week 9+) — Verdicts.** D7; the "what worked" view over the ledger.
- **P6 (triggered) — Edge layer, link graph, visual topic map.** D11, D10.

## Cuts

- TikTok monitoring — no viable source.
- Per-Move dollar ranges and any headline "revenue attribution" figure.
- The edge layer as a scheduled phase.
- Daily briefing cadence; "nothing changed" messages.
- `google_trends` and scheduled `content_analysis`.
- A second migrations directory outside `drizzle/`; registering custom
  tables in upstream's barrels or parity test.
- A direct Anthropic client; any new npm dependency for push or LLM calls.
- A hook in `server.ts`, `wrangler.jsonc`, `alchemy.run.ts`, `package.json`,
  or `AppShell.tsx`.
- Rank-change email alerts, client report links, a cost dashboard UI, CrUX —
  left to upstream (#208, #209, #268, #242).
- The 16-month GSC backfill — until verdicts need it.
- The visual topic graph — until the matrix has users.

## Adjudication log

Findings from the three reviewers, grouped by topic. _Accepted_ means the
decision above reflects the finding; _overridden_ means it does not, with the
reason.

**Edge layer as first write path** — Simplicity (blocker), Product (major),
Domain (blocker: the officiant site is already Worker-served, so a route in
front could send its traffic to stale DNS). Accepted: deferred to a triggered
phase (D11), the apply loop replaces it (D6). Overridden in part: the
simplicity reviewer wanted it reduced to a "re-open trigger"; it stays a
designed phase because the owner's autonomy and sellability goals need a
CMS-independent write path eventually, and the domain findings (buffer and
fail-open, KV control plane, additive-only safe tier, UA-independence, canary
as DOM diff, route inventory first) are folded into the design now so nothing
is relearned later.

**Openings already exist** — Simplicity, Product. Accepted (D3). Verified
independently against `SearchOpportunityService.ts`.

**EV scoring is noise** — Simplicity, Product. Accepted the product
reviewer's version (D2): ordinal within a site, one multiplier across sites,
dollar buckets only. Overridden: the simplicity reviewer's cut of the value
fields from P1 — the site multiplier is what makes cross-site ranking mean
anything and it is three optional fields.

**Experiment layer ahead of the data** — Simplicity. Accepted the substance
(D7: before/after first, DiD after 20 Moves). Overridden: dropping
`hypothesis` and `review_at` — two fields, and `review_at` is what schedules
the verdict push.

**Decay floors and seasonality** — Product (minor). Accepted (D4).

**Briefing cadence, transport, prototype** — Product (major). Accepted in
full (D5, P0). The prototype-through-a-scheduled-agent finding is the best
single item in the review: it delivers the briefing this week with no app
code and tells us what the owner acts on.

**Move record lacks approval fields** — Product (major). Accepted (D1),
except `retire_when_origin_matches`, which belongs to the edge design.

**Cost guard timing and mechanism** — Simplicity (guards nothing in P1),
Product (self-host discards costs; one hook line; caps). Accepted the
product mechanism at the simplicity reviewer's timing: ships with the first
scheduled paid pull (P4), not P1.

**Intelligence features are resume features** — Simplicity (major).
Accepted: `content_analysis` and `google_trends` cut from scheduling; SAM
covers topical coverage on demand; GBP reviews and monthly brand snapshot
kept. Overridden: cutting internal links and the coverage matrix outright —
the owner asked for both; they are gated on scale instead (D9, D10).

**Migrations** — Simplicity (hand-written `9000_` files), Product (`9001_`
files, defer Postgres), Domain (`drizzle/custom/` subfolder with its own
journal; alchemy lists recursively). Accepted the domain mechanism (D14): it
is the only one that keeps real generated migrations and a journal. Accepted
keeping tables out of upstream's barrels and writing our own parity test.
Overridden: deferring the Postgres schema file — it is a copy and the parity
test is meaningless without it; only Postgres _migrations_ are deferred.

**Hook count and hot files** — Simplicity (budget 8), Product (`mcp/server.ts`
and `server.ts` are hot; use a separate Worker; no new deps; sync at tags),
Domain (`alchemy.run.ts` mandatory if env is added; knip; `routeTree.gen.ts`
is tracked; lean-bundle plugin; dynamic imports). Accepted the separate
Worker (D12), which removes `server.ts`, `wrangler.jsonc`, and — because the
Worker holds its own secrets — `alchemy.run.ts` from the hook list entirely.
Accepted knip entry, dynamic imports, tag-based sync, regenerating the route
tree (D15, D17). Overridden: chaining custom migrations into `package.json`
(26 changes in 60 days) — documented as a separate command instead.

**PWA behind Access** — Domain (major: manifest credentials; iOS standalone
re-login unverified). Accepted: the spike moves to P0, the `crossOrigin` fix
lands in the root hook, Telegram carries notifications until the spike
passes (D5, D8, D16).

**P0 completeness** — Product (minor). Accepted: Google OAuth client,
OpenRouter key, transport token, top-up added to P0.

**LLM provider** — Simplicity (use OpenRouter), Domain (no static SDK
import). Accepted (D16).

**Mobile phase scope** — Simplicity (shrink to SW + push + Done/Skip).
Overridden in part: the tab bar stays because native feel is a stated
constraint (C4) and it is cheap from the root hook; the "fix the ten
hidden-content files" item is dropped until usage shows which pages matter on
a phone.

**FORK.md says "push fixes upstream as PRs"** — Simplicity, Product, Domain.
Accepted; fixed in the same commit as this file (D19).

## Open questions

- **Q1.** Does an installed iOS PWA complete a Cloudflare Access re-login in
  standalone mode? Settled by the P0 spike.
- **Q2.** Does DataForSEO `content_analysis` return anything useful for a
  small local brand? Settled by one probe on the free credit.
- **Q3.** How is `www.robynashleyweddings.com` bound to its Worker — route or
  custom domain? Settled by the route inventory before P6.
- **Q4.** Does the API token hold zone-level Workers Routes Edit? Settled
  when P6 triggers; irrelevant before.
