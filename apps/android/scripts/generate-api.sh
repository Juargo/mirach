#!/usr/bin/env bash
# Regenerates the Kotlin API client from apps/api/openapi.json into
# app/src/main/kotlin/app/mirachbudget/android/core/api/generated/.
# Deterministic: the generator version and the SHA-256 of its jar are pinned below and the output
# is committed. CI runs this script and fails if `git diff` is not empty.
set -euo pipefail

GENERATOR_VERSION="7.25.0"
GENERATOR_SHA256="41ce4f6b07f196676439d710759fa1ced7a08066d06ff1bf314681470289efae"
GENERATOR_URL="https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/${GENERATOR_VERSION}/openapi-generator-cli-${GENERATOR_VERSION}.jar"
PACKAGE="app.mirachbudget.android.core.api.generated"

cd "$(dirname "$0")/.."
android_dir="$(pwd)"
spec="$android_dir/../api/openapi.json"
package_path="$(echo "$PACKAGE" | tr . /)"
out="$android_dir/app/src/main/kotlin/$package_path"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/mirach/openapi-generator"
jar="$cache_dir/openapi-generator-cli-${GENERATOR_VERSION}.jar"
if [ ! -f "$jar" ] || [ "$(sha256 "$jar")" != "$GENERATOR_SHA256" ]; then
  mkdir -p "$cache_dir"
  curl -fsSL -o "$jar.tmp" "$GENERATOR_URL"
  if [ "$(sha256 "$jar.tmp")" != "$GENERATOR_SHA256" ]; then
    rm -f "$jar.tmp"
    echo "error: SHA-256 mismatch for openapi-generator-cli-${GENERATOR_VERSION}.jar" >&2
    exit 1
  fi
  mv "$jar.tmp" "$jar"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# --skip-validate-spec: the validator rejects `contentEncoding` (a 3.1 keyword) on the multipart
# `file` parts of /api/ingestas*; the generator still handles them (see README, "Cliente generado").
java -jar "$jar" generate \
  --generator-name kotlin \
  --library jvm-retrofit2 \
  --input-spec "$spec" \
  --output "$work" \
  --skip-validate-spec \
  --global-property apiTests=false,modelTests=false,apiDocs=false,modelDocs=false \
  --additional-properties "packageName=${PACKAGE},serializationLibrary=kotlinx_serialization,useCoroutines=true,omitGradleWrapper=true" \
  > "$work/generator.log" 2>&1 || { cat "$work/generator.log" >&2; exit 1; }

# Any warning other than the two known ones means part of the contract is being dropped or
# misread. Known: validation is skipped on purpose, and the spec has no operationIds, so the
# generator derives stable names from method + path (e.g. apiAuthMeGet).
warnings="$(grep "WARN" "$work/generator.log" | grep -v -e "validation has been explicitly disabled" -e "Empty operationId found" || true)"
if [ -n "$warnings" ]; then
  echo "$warnings" >&2
  echo "error: the generator emitted warnings (see above); fix the contract or this script" >&2
  exit 1
fi

rm -rf "$out"
mkdir -p "$out"
cp -R "$work/src/main/kotlin/$package_path/." "$out/"
echo "Generated $(find "$out" -name '*.kt' | wc -l | tr -d ' ') files in ${out#"$android_dir"/}"
