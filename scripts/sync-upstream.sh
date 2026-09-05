#!/usr/bin/env bash
# Pull the newest upstream RELEASE (every-app/open-seo tag) into this fork on a
# review branch.
#
#   ./scripts/sync-upstream.sh            # show what the newest release changed, touch nothing
#   ./scripts/sync-upstream.sh --merge    # create sync/upstream-<tag> and merge that tag
#
# We target tags, not upstream/main: the maintainer reverts within the week
# often enough that HEAD is not a safe merge target. Our own work stays on
# `main`; upstream lands on a sync branch you review and merge, so a bad
# release can never silently reach a deploy.
set -euo pipefail

UPSTREAM_URL="https://github.com/every-app/open-seo.git"
BASE_BRANCH="main"
MERGE=false
[[ "${1:-}" == "--merge" ]] && MERGE=true

cd "$(dirname "$0")/.."

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "Adding 'upstream' remote -> $UPSTREAM_URL"
  git remote add upstream "$UPSTREAM_URL"
fi

echo "Fetching upstream tags..."
git fetch --quiet upstream --tags

# Newest tag by version sort (v0.1.10 > v0.1.9).
TAG=$(git tag --list 'v*' --sort=-version:refname | head -1)
if [[ -z "$TAG" ]]; then
  echo "No upstream release tags found."
  exit 1
fi

AHEAD=$(git rev-list --count "$BASE_BRANCH".."$TAG")
if [[ "$AHEAD" == "0" ]]; then
  echo "Already contains $TAG. Nothing to sync."
  exit 0
fi

BEHIND=$(git rev-list --count "$TAG".."$BASE_BRANCH")
MERGE_BASE=$(git merge-base "$BASE_BRANCH" "$TAG")

echo
echo "=============================================================="
echo " Newest release: $TAG — $AHEAD new commit(s); $BEHIND local commit(s) of ours"
echo "=============================================================="
echo
echo "--- Release notes added or changed (what actually shipped) ---"
git diff --name-only "$MERGE_BASE".."$TAG" -- release-notes/ || true
echo
echo "--- Upstream commits ---"
git log --oneline --no-decorate "$BASE_BRANCH".."$TAG" | head -60
echo
echo "--- Files both sides changed (these are the conflicts) ---"
comm -12 \
  <(git diff --name-only "$MERGE_BASE".."$BASE_BRANCH" | sort) \
  <(git diff --name-only "$MERGE_BASE".."$TAG" | sort) \
  || true
echo
echo "--- Our hooks in files upstream touched (re-check each after merge) ---"
git diff --name-only "$MERGE_BASE".."$TAG" | while read -r f; do
  [[ -f "$f" ]] && grep -l "FORK:" "$f" 2>/dev/null || true
done
echo

if [[ "$MERGE" != "true" ]]; then
  echo "Review the above, then run:  ./scripts/sync-upstream.sh --merge"
  exit 0
fi

BRANCH="sync/upstream-$TAG"
echo "Creating $BRANCH from $BASE_BRANCH..."
git checkout -q "$BASE_BRANCH"
git checkout -q -B "$BRANCH"

if git merge --no-edit "$TAG"; then
  echo
  echo "Merged $TAG cleanly onto $BRANCH."
else
  echo
  echo "!! Merge conflicts. Resolve them, then:  git add -A && git commit"
  echo "Conflicting files:"
  git diff --name-only --diff-filter=U
fi

# Both sides add routes; the generated tree is regenerated, never merged.
if git diff --name-only --diff-filter=U | grep -q "src/routeTree.gen.ts"; then
  echo
  echo "src/routeTree.gen.ts conflicted — regenerate it instead of resolving by hand:"
  echo "  git checkout --theirs src/routeTree.gen.ts && pnpm build && git add src/routeTree.gen.ts"
fi

echo
echo "Next: pnpm install && pnpm build && pnpm test"
echo "Then: git checkout $BASE_BRANCH && git merge $BRANCH"
echo "And redeploy: pnpm deploy:selfhost --yes && wrangler deploy -c wrangler.custom.jsonc"
