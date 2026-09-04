# This fork

`blackdigitss/open-seo`, forked from [`every-app/open-seo`](https://github.com/every-app/open-seo).

Goal: make our own changes freely, but still take upstream's good releases with
a low-drama merge. The whole strategy is one idea — **keep our changes additive
and out of upstream's way**, so most merges are trivial.

## Branches

| Branch                 | What it is                                                   |
| ---------------------- | ------------------------------------------------------------ |
| `main`                 | Ours. Upstream + our customizations. Deploys come from here. |
| `upstream/main`        | Their repo (a remote, not a branch we commit to).            |
| `sync/upstream-<date>` | Throwaway review branch where an upstream merge is tested.   |

Upstream never merges straight into `main`. It lands on a `sync/*` branch,
gets reviewed and built, then merges.

## Taking upstream changes

Automatic: `.github/workflows/sync-upstream.yml` checks every Monday. If
upstream moved and merges cleanly it opens a PR; if it conflicts it opens an
issue. Nothing lands without a human merging it.

Manual, any time:

```bash
./scripts/sync-upstream.sh          # what's new upstream + which files will fight us
./scripts/sync-upstream.sh --merge  # do the merge on a sync/ branch
```

Then:

```bash
pnpm install && pnpm build && pnpm test
git checkout main && git merge sync/upstream-<date>
pnpm deploy:selfhost --yes
```

## Keeping merges cheap

Merge pain comes entirely from editing the same lines upstream edits. So:

1. **Add files instead of editing them.** New feature → new module, new route,
   new component. Upstream almost never touches a file that doesn't exist in
   their tree.
2. **Put our code in owned directories.** `src/custom/**` and
   `plugins/blackdigits/**` are ours; upstream will never write there.
3. **When you must edit an upstream file, edit as few lines as possible** —
   ideally one import plus one call into our own module. Big rewrites of
   upstream files are what turn a 5-minute merge into an afternoon.
4. **Mark every edit to an upstream file** so it survives review:

   ```ts
   // FORK: <what and why>
   ```

   `grep -rn "FORK:" src` lists our entire footprint in upstream code. Keep
   that list short.

5. **Push genuinely general fixes upstream** as PRs. Anything they accept is
   one less thing we carry forever.

## Our customizations

Nothing yet beyond fork infrastructure (`FORK.md`, `scripts/sync-upstream.sh`,
`.github/workflows/sync-upstream.yml`). Add to this list as we go — an
up-to-date inventory is what makes a conflicted merge tractable.

## Deploying

See `docs/SELF_HOSTING_CLOUDFLARE.md`. Config lives in `.env.selfhost`
(gitignored). Deploy: `pnpm deploy:selfhost --yes`.
