#!/usr/bin/env bash
# Generates Mirach.xcodeproj from project.yml, regardless of the caller's cwd.
set -euo pipefail

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "XcodeGen no está instalado. Instálalo con: brew install xcodegen" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
xcodegen generate

# The generated project is git-ignored, so the committed Package.resolved pins
# every Swift package, transitive ones included, and is copied into it here.
resolved_dir=Mirach.xcodeproj/project.xcworkspace/xcshareddata/swiftpm
mkdir -p "$resolved_dir"
cp Package.resolved "$resolved_dir/Package.resolved"
