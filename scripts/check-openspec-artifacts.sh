#!/usr/bin/env bash
#
# check-openspec-artifacts.sh — guards the SDD record against two failure modes.
#
# Why this exists
# ---------------
# US-043 and US-063 both shipped with their `openspec/changes/<name>/` artifacts
# NEVER `git add`-ed. In US-043 that was found at archive time, with the change
# already in production; in US-063 it was found mid-flight, by accident, after
# four PRs had been reviewed against a frozen spec that existed on one laptop
# and nowhere else.
#
# Every other change in the repo was committed on its creation day. The two that
# were not are the two most recent — the two planned and executed end-to-end
# inside an agent session. The apply phase commits code because gates demand it;
# nothing ever demanded the plan.
#
# Two modes, because they are detectable in different places
# ----------------------------------------------------------
#   untracked  (default, LOCAL only) — files present on disk but absent from git.
#              CI CANNOT run this check: a CI checkout is a clone, so untracked
#              files do not exist there and the check would pass vacuously,
#              precisely in the case it is meant to catch. Wired into pre-push.
#
#   structure  (CI) — every TRACKED change directory carries its required
#              artifacts. Catches the partial case: someone commits tasks.md but
#              not specs/, so the frozen spec that judgment-day and sdd-verify
#              cite as authority is still missing from the repo.
#
# Usage: check-openspec-artifacts.sh [untracked|structure]

set -euo pipefail

MODE="${1:-untracked}"
CHANGES_DIR="openspec/changes"

cd "$(git rev-parse --show-toplevel)"

if [ ! -d "$CHANGES_DIR" ]; then
  echo "No $CHANGES_DIR directory — nothing to check."
  exit 0
fi

# `archive/` holds closed changes; they are already committed by definition and
# an archived change legitimately has a different shape (it carries an
# archive-report.md and may predate the current artifact conventions).
list_active_changes() {
  find "$CHANGES_DIR" -mindepth 1 -maxdepth 1 -type d ! -name archive -print | sort
}

case "$MODE" in
  untracked)
    untracked=$(git ls-files --others --exclude-standard -- "$CHANGES_DIR" || true)

    if [ -n "$untracked" ]; then
      echo "ERROR: SDD artifacts exist on disk but are not tracked by git:" >&2
      echo "$untracked" | sed 's/^/  /' >&2
      cat >&2 <<'EOF'

These files are the change's contract — the frozen spec that judgment-day and
sdd-verify treat as authority, and that PR reviews are conducted against. Until
they are committed they exist only on this machine.

Fix:
  git add openspec/changes/<name>/
  git commit -m "docs(sdd): track the <name> change artifacts"

To push anyway (you own the consequence):
  git push --no-verify
EOF
      exit 1
    fi

    echo "OK: no untracked SDD artifacts."
    ;;

  structure)
    # Calibration matters more than strictness here. A check that fails against
    # a healthy repo on the day it is installed gets bypassed, and then it
    # protects nothing.
    #
    # HARD requirement: tasks.md only. Every change has one, and it is what
    # sdd-apply and sdd-verify actually read. Its absence from git is
    # unambiguous — the change cannot be executed or verified from the repo.
    #
    # WARNED, not failed: proposal.md and a spec. `specs/` is legitimately
    # absent from pure tooling/CI changes (dast-ci-wiring has no spec delta),
    # and dast-ci-wiring also has no proposal.md — a real gap, but a
    # pre-existing and defensible one. Demanding them would teach people to
    # commit placeholder files, which is worse than the gap it closes.
    required=(tasks.md)
    advisory=(proposal.md)
    failed=0

    while IFS= read -r change; do
      [ -z "$change" ] && continue
      name=$(basename "$change")

      # Only judge directories git actually knows about. A directory present in
      # the CI checkout is tracked by definition, but this keeps the script
      # honest when run locally against a half-added change.
      if [ -z "$(git ls-files -- "$change")" ]; then
        echo "  $name: not tracked by git — skipped here, caught by 'untracked' mode locally"
        continue
      fi

      missing=()
      for artifact in "${required[@]}"; do
        if [ -z "$(git ls-files -- "$change/$artifact")" ]; then
          missing+=("$artifact")
        fi
      done

      soft=()
      for artifact in "${advisory[@]}"; do
        if [ -z "$(git ls-files -- "$change/$artifact")" ]; then
          soft+=("$artifact")
        fi
      done

      if [ ${#missing[@]} -gt 0 ]; then
        echo "::error::openspec change '$name' is tracked but missing required artifact(s): ${missing[*]}. A partially committed change leaves reviewers citing a contract the repo does not contain."
        failed=1
      elif [ ${#soft[@]} -gt 0 ]; then
        echo "::warning::openspec change '$name' has no ${soft[*]}. Not blocking — some changes legitimately skip it — but worth confirming it was a choice rather than an omission."
        echo "  $name: OK (advisory: missing ${soft[*]})"
      else
        echo "  $name: OK"
      fi
    done < <(list_active_changes)

    if [ "$failed" -ne 0 ]; then
      exit 1
    fi

    echo "OK: every tracked SDD change carries its required artifacts."
    ;;

  *)
    echo "Unknown mode: $MODE (expected 'untracked' or 'structure')" >&2
    exit 2
    ;;
esac
