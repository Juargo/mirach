#!/usr/bin/env bash
# Regenerates the API client (Types.swift, Client.swift) from apps/api/openapi.json.
# Deterministic: the generator version is pinned in scripts/openapi-generator/Package.swift
# and the output is committed. CI runs this script and fails if `git diff` is not empty.
set -euo pipefail

cd "$(dirname "$0")/.."
ios_dir="$(pwd)"
spec="$ios_dir/../api/openapi.json"
out="$ios_dir/Mirach/Core/API/Generated"

mkdir -p "$out"
swift run --package-path "$ios_dir/scripts/openapi-generator" -c release swift-openapi-generator generate \
  --config "$ios_dir/scripts/openapi-generator-config.yaml" \
  --output-directory "$out" \
  --mode types --mode client \
  "$spec"
