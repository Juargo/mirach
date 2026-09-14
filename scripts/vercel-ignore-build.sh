#!/usr/bin/env bash
#
# vercel-ignore-build.sh — Vercel "Ignored Build Step" for apps/web and apps/landing.
#
# Vercel runs each project's `ignoreCommand` from its Root Directory
# (`apps/web` or `apps/landing`) and reads the exit code: 0 skips the build
# (the deployment ends CANCELED), anything else builds.
#
# Why not `git diff HEAD^ HEAD`
# -----------------------------
# That compares only the LAST commit. A preview branch whose last commit touched
# nothing under the app — a spec-only commit on top of app changes — was skipped
# even though the branch as a whole changes the app (PR #671 got no preview).
#
# What this compares
# ------------------
#   production  `main` only receives merge commits, so HEAD^ (first parent) is
#               the previous `main` and HEAD^..HEAD already spans the whole PR.
#   preview     the branch against its merge-base with `main`. Vercel clones
#               shallowly (`--depth=10`, current branch only), so `main` is
#               fetched explicitly from the repository.
#
# Fail-open: any git or network failure builds. A wasted build is cheap; a
# silently skipped preview hides exactly the change it was meant to show.

set -u

# Relative to the Root Directory: the app itself plus the workspace-wide inputs
# that can change its build.
WATCHED=(. ../../pnpm-lock.yaml ../../pnpm-workspace.yaml)
MAIN_FETCH_DEPTH=200

build() {
  echo "vercel-ignore-build: $1 -> build"
  exit 1
}

skip() {
  echo "vercel-ignore-build: $1 -> skip"
  exit 0
}

diff_against() {
  # `git diff --quiet` exits 0 with no changes, 1 with changes, >1 on error.
  git diff --quiet "$1" HEAD -- "${WATCHED[@]}"
  case $? in
    0) skip "no changes vs $2" ;;
    1) build "changes vs $2" ;;
    *) build "git diff failed vs $2" ;;
  esac
}

if [ "${VERCEL_ENV:-}" = "production" ]; then
  diff_against HEAD^ "previous commit on main"
fi

repo_url="https://github.com/${VERCEL_GIT_REPO_OWNER:-Juargo}/${VERCEL_GIT_REPO_SLUG:-MoneyDiary}.git"
if ! git fetch --quiet --no-tags --depth="$MAIN_FETCH_DEPTH" "$repo_url" main; then
  build "could not fetch main"
fi

if base=$(git merge-base FETCH_HEAD HEAD 2>/dev/null); then
  diff_against "$base" "merge-base with main"
fi

# The shallow branch history may not reach the fork point. Comparing the two
# tips can only over-report (changes merged to main since then also count),
# which errs toward building.
diff_against FETCH_HEAD "tip of main (merge-base outside the shallow clone)"
