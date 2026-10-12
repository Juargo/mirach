#!/usr/bin/env bash
# Regenerates the Kotlin design tokens (core/design/GeneratedTokens.kt) from
# design/tokens.json. Needs only Node (no dependencies). Deterministic: the output
# is committed and CI runs this script and fails if `git diff` is not empty.
set -euo pipefail

cd "$(dirname "$0")/../../.."
node scripts/generate-android-tokens.mjs
