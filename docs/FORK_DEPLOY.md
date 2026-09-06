# Deploying the fork

Two Workers: upstream's app (`pnpm deploy:selfhost`) and ours
(`wrangler.custom.jsonc`), sharing one D1, KV and R2. Commands are written out
rather than added to `package.json`, which upstream changes constantly.

## One-time: a Cloudflare credential that can create the login gate

The deploy provisions a Cloudflare Access application — the email gate in front
of the app. The API token currently in the environment cannot: it has Workers,
D1, KV, R2 and Zones, but nothing for Zero Trust, and it cannot grant itself
more. Pick either route.

### A. A scoped API token (recommended — non-interactive forever)

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

### B. OAuth login

```bash
pnpm alchemy login --configure
```

Answer **OAuth**, then yes to _"Customize OAuth scopes?"_, and tick
`access:write` alongside the preselected defaults. This needs a real terminal —
it draws interactive menus, so it will appear to do nothing if the prompts
cannot render. Run it directly in Terminal, in the repo directory.

If Zero Trust has never been enabled on the account, the deploy creates the team
for you (named after the workers.dev subdomain, `davainwalker`). Enabling it
first at <https://one.dash.cloudflare.com> also works.

## Deploy

```bash
# 1. The app (D1, KV, R2, migrations, both upstream Workers, the Access gate)
pnpm deploy:selfhost --yes

# 2. Point the custom Worker at the resources that deploy just created
node scripts/custom/worker-config.mjs --stage selfhost \
  --app-url https://open-seo-selfhost.davainwalker.workers.dev

# 3. Our tables (alchemy applies drizzle/custom/ with the app's migrations, but
#    this makes it explicit and is how you re-run them)
pnpm exec wrangler d1 migrations apply DB --remote -c wrangler.custom.jsonc

# 4. Keys for notifications, then push every secret the jobs need
node scripts/custom/vapid.mjs          # writes VAPID keys into .env.custom
node scripts/custom/secrets.mjs        # .env.selfhost + .env.custom -> Worker

# 5. The scheduled Worker
pnpm exec wrangler deploy -c wrangler.custom.jsonc
```

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

## After an upstream merge

```bash
pnpm install && pnpm build && pnpm test
pnpm deploy:selfhost --yes
pnpm exec wrangler deploy -c wrangler.custom.jsonc
```
