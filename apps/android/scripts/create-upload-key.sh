#!/usr/bin/env bash
# Creates the Google Play *upload* key for the Android app, outside the repository.
#
#   ~/.config/mirach/android-upload.jks          the keystore
#   ~/.config/mirach/android-upload.properties   what app/build.gradle.kts reads
#
# Both paths can be moved with MIRACH_ANDROID_SIGNING_DIR. The script refuses to overwrite
# existing files and never prints the generated password. Back both files up somewhere
# private: with Play App Signing a lost upload key can be reset, but only through Google support.
set -euo pipefail

dir="${MIRACH_ANDROID_SIGNING_DIR:-$HOME/.config/mirach}"
jks="$dir/android-upload.jks"
props="$dir/android-upload.properties"
alias_name="mirach-upload"

command -v keytool >/dev/null || { echo "keytool not found (install JDK 17)." >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl not found." >&2; exit 1; }

for f in "$jks" "$props"; do
  if [ -e "$f" ]; then
    echo "Refusing to overwrite existing file: $f" >&2
    exit 1
  fi
done

mkdir -p "$dir"
chmod 700 "$dir"
umask 077

# 32 random bytes as hex: no characters that need escaping in .properties or the shell.
password="$(openssl rand -hex 32)"

keytool -genkeypair -v \
  -keystore "$jks" -storetype PKCS12 \
  -alias "$alias_name" -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$password" -keypass "$password" \
  -dname "CN=Mirach, O=Mirach, C=CL" >/dev/null

{
  echo "storeFile=$jks"
  echo "storePassword=$password"
  echo "keyAlias=$alias_name"
  echo "keyPassword=$password"
} >"$props"
chmod 600 "$jks" "$props"

echo "Created $jks"
echo "Created $props"
echo
echo "Upload certificate fingerprints (register the SHA-1 in the Android OAuth client):"
keytool -list -v -keystore "$jks" -alias "$alias_name" -storepass "$password" \
  | awk '/SHA1:|SHA256:/ { sub(/^ +/, ""); print }'
