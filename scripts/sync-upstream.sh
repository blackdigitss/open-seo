#!/usr/bin/env bash
# Pull upstream (every-app/open-seo) changes into this fork on a review branch.
#
#   ./scripts/sync-upstream.sh            # show what's new upstream, don't touch anything
#   ./scripts/sync-upstream.sh --merge    # create sync/upstream-<date> and merge upstream/main
#
# Our own work stays on `main`. Upstream never lands on `main` directly — it
# lands on a sync branch you review and merge, so a bad upstream release can
# never silently reach a deploy.
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

echo "Fetching upstream..."
git fetch --quiet upstream --tags

AHEAD=$(git rev-list --count "$BASE_BRANCH"..upstream/main)
BEHIND=$(git rev-list --count upstream/main.."$BASE_BRANCH")

if [[ "$AHEAD" == "0" ]]; then
  echo "Already up to date with upstream/main. ($BEHIND local commit(s) of our own.)"
  exit 0
fi

echo
echo "=============================================================="
echo " $AHEAD new upstream commit(s); $BEHIND local commit(s) of ours"
echo "=============================================================="
echo
echo "--- New upstream commits ---"
git log --oneline --no-decorate "$BASE_BRANCH"..upstream/main
echo
echo "--- New/changed release notes (what the release actually shipped) ---"
git diff --name-only "$BASE_BRANCH"..upstream/main -- release-notes/ || true
echo
echo "--- Files upstream changed that we have also modified (likely conflicts) ---"
# Files we changed relative to the last upstream commit we share.
MERGE_BASE=$(git merge-base "$BASE_BRANCH" upstream/main)
comm -12 \
  <(git diff --name-only "$MERGE_BASE".."$BASE_BRANCH" | sort) \
  <(git diff --name-only "$MERGE_BASE"..upstream/main | sort) \
  || true
echo

if [[ "$MERGE" != "true" ]]; then
  echo "Review the above, then run:  ./scripts/sync-upstream.sh --merge"
  exit 0
fi

BRANCH="sync/upstream-$(date +%Y-%m-%d)"
echo "Creating $BRANCH from $BASE_BRANCH..."
git checkout -q "$BASE_BRANCH"
git checkout -q -B "$BRANCH"

if git merge --no-edit upstream/main; then
  echo
  echo "Merged cleanly onto $BRANCH."
else
  echo
  echo "!! Merge conflicts. Resolve them, then:  git add -A && git commit"
  echo "Conflicting files:"
  git diff --name-only --diff-filter=U
fi

echo
echo "Next: pnpm install && pnpm build && pnpm test"
echo "Then: git checkout $BASE_BRANCH && git merge $BRANCH"
echo "And redeploy: pnpm deploy:selfhost --yes"
