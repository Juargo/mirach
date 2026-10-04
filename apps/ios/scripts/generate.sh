#!/usr/bin/env bash
# Generates Mirach.xcodeproj from project.yml, regardless of the caller's cwd.
set -euo pipefail

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "XcodeGen no está instalado. Instálalo con: brew install xcodegen" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
xcodegen generate
