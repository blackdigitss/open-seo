# Deploying the fork

Two Workers: upstream's app (`pnpm deploy:selfhost`) and ours
(`wrangler.custom.jsonc`), sharing one D1, KV and R2. Commands are written out
rather than added to `package.json`, which upstream changes constantly.

## One-time: a Cloudflare credential that can create the login gate

The deploy provisions a Cloudflare Access application — the email gate in front
of the app. The API token currently in the environment cannot: it has Workers,
D1, KV, R2 and Zones, but nothing for Zero Trust, and it cannot grant itself
more. Pick either route.

### A. Enable Zero Trust, then set `TEAM_DOMAIN` (fastest — try this first)

The existing token answers `/access/apps` with _"Access is not enabled"_ (a
real answer — it has the permission) but `/access/organizations` with
_"Authentication error"_ (it does not). Setting `TEAM_DOMAIN` skips the
organization lookup entirely, so the existing token may be enough.

1. Open <https://one.dash.cloudflare.com>, pick a team name (free plan is
   fine). The team domain is `<team>.cloudflareaccess.com`.
2. Add it to `.env.selfhost`:

   ```
   TEAM_DOMAIN=https://<team>.cloudflareaccess.com
   ```

3. Deploy. If it still fails on Access, use B or C.

Leave `POLICY_AUD` unset — the deploy creates the application and derives it.

### B. A scoped API token (non-interactive forever)

At <https://dash.cloudflare.com/profile/api-tokens> → **Create Token** → **Create
Custom Token**, add these permissions:

| Type    | Permission                                            | Level |
| ------- | ----------------------------------------------------- | ----- |
| Account | Workers Scripts                                       | Edit  |
| Account | Workers KV Storage                                    | Edit  |
| Account | Workers R2 Storage                                    | Edit  |
| Account | D1                                                    | Edit  |
| Account | Access: Apps and Policies                             | Edit  |
| Account | Access: Organizations, Identity Providers, and Groups | Edit  |
| Account | Workers AI                                            | Edit  |
| Zone    | Workers Routes                                        | Edit  |

Account Resources: the one account. Zone Resources: all zones. Then:

```bash
export CLOUDFLARE_API_TOKEN='<the new token>'
export CLOUDFLARE_ACCOUNT_ID=41365bfb73692b66110ccfe32bde100d
```

Put both in your shell profile so later deploys just work.

### C. OAuth login

```bash
pnpm alchemy login --configure
```

Answer **OAuth**, then yes to _"Customize OAuth scopes?"_, and tick
`access:write` alongside the preselected defaults. This needs a real terminal —
it draws interactive menus, so it will appear to do nothing if the prompts
cannot render. Run it directly in Terminal, in the repo directory.

**Zero Trust must already exist.** The deploy only creates a team when the API
reports _no organization_; a brand-new account instead returns _"Access is not
enabled"_, which alchemy treats as fatal. Create it once — either click **Enable
Access** at <https://one.dash.cloudflare.com>, or with the logged-in token:

```bash
TOK=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.alchemy/credentials/default/cf-oauth.json')))['access'])")
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/organizations" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"name":"davainwalker","auth_domain":"davainwalker.cloudflareaccess.com"}'
```

This account's team is `davainwalker.cloudflareaccess.com`, created 2026-09-06.

## Deploy

```bash
# 1. The app (D1, KV, R2, migrations, both upstream Workers, the Access gate)
pnpm deploy:selfhost --yes

# 2. Point the custom Worker at the resources that deploy just created
node scripts/custom/worker-config.mjs --stage selfhost \
  --app-url https://open-seo-selfhost.davainwalker.workers.dev

# 3. Keys for notifications, then push every secret the jobs need
node scripts/custom/vapid.mjs          # writes VAPID keys into .env.custom
node scripts/custom/secrets.mjs        # .env.selfhost + .env.custom -> Worker

# 4. The scheduled Worker
pnpm exec wrangler deploy -c wrangler.custom.jsonc
```

Our tables need no separate migration step: alchemy walks `drizzle/`
recursively, so step 1 applies `drizzle/custom/` alongside upstream's. Running
`wrangler d1 migrations apply` against `d1_custom_migrations` afterwards fails
with "table already exists" — it keeps its own ledger and doesn't know alchemy
already ran them.

Check it: `curl https://open-seo-custom.davainwalker.workers.dev/health` lists
the jobs and the last runs.

## Turning things on

| Feature                   | What it needs                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Moves from Search Console | Connect GSC per project in the app (needs `GOOGLE_CLIENT_ID`/`SECRET` + `BETTER_AUTH_SECRET` in `.env.selfhost`) |
| Better opening scores     | Connect Google Analytics too                                                                                     |
| Email                     | `LOOPS_API_KEY` in `.env.custom` — the template creates itself                                                   |
| Push                      | `node scripts/custom/vapid.mjs`, then install the app to the home screen                                         |
| iMessage                  | A running BlueBubbles server; `BLUEBUBBLES_URL` + `_PASSWORD`                                                    |
| Drafts in your voice      | `OPENROUTER_API_KEY` in `.env.selfhost` (else Workers AI, else templates)                                        |
| Anything paid             | A real `DATAFORSEO_API_KEY` (the placeholder is deliberately ignored)                                            |

## Running a job by hand

```bash
curl -X POST -H "x-run-secret: $CUSTOM_RUN_SECRET" \
  "https://open-seo-custom.davainwalker.workers.dev/run?job=moves_refresh"
```

Jobs: `config_sync`, `gsc_append`, `moves_refresh`, `verify_crawl`, `verdicts`,
`weekly_plan`, `budget_watch`. The scheduled ones run off a 5-minute cron with a
ledger, so each period runs once and a failure retries up to three times.

To pause everything: `wrangler secret put CUSTOM_JOBS_DISABLED -c
wrangler.custom.jsonc` and enter `1`.

## RAW integration (robynashleyweddings.com)

RAW is served by the account's own `raw-router` Worker via zone routes, and a
second routed Worker cannot sit in front of it (same-zone `fetch()` can't
target a route). The right integration is INSIDE raw-router, and it's small:

1. In raw-router's wrangler config, bind the shared KV
   (`OPENSEO_KV`, id `1597cbb99fe440d89a7df395da5de7e4`).
2. Copy `src/custom/edge/embed.js` from this repo into raw-router as
   `openseo-edge-embed.js`.
3. In `fetchFromPages`, wrap the final non-redirect return:
   `return applyOpenSeoRules(response, url, env.OPENSEO_KV);`
   (The 3xx branch and asset responses are ignored by the module itself.)

**Wired and live since 2026-09-07** — the raw-router copy lives at
`RAW/04-systems/deploy/cloudflare` (its own small git repo; revert = `git
revert` the wiring commit + redeploy). Verified byte-identical on home,
/about, /blog and /officiant-kit after deploy. One nuance: raw-router sets
`s-maxage=600` on HTML, so an applied or killed rule can take up to ten
minutes to reach every visitor — fine for SEO tags.

## After an upstream merge

```bash
pnpm install && pnpm build && pnpm test
pnpm deploy:selfhost --yes
pnpm exec wrangler deploy -c wrangler.custom.jsonc
```
