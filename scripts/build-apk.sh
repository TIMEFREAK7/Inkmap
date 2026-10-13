#!/usr/bin/env bash
# Builds the signed release APK. The keystore stays outside the repo.
# Usage: KEYSTORE_PASSWORD=... scripts/build-apk.sh /path/to/inkmap-release.jks
set -euo pipefail
: "${KEYSTORE_PASSWORD:?set KEYSTORE_PASSWORD}"
: "${ANDROID_HOME:?set ANDROID_HOME to the Android SDK}"
export KEYSTORE_FILE="$(realpath "${1:?path to inkmap-release.jks}")" KEY_ALIAS=inkmap KEY_PASSWORD="$KEYSTORE_PASSWORD"
cd "$(dirname "$0")/.."
[ "$(git rev-parse --is-shallow-repository)" = false ] || { echo "Shallow clone: run git fetch --unshallow first (version code is the commit count)"; exit 1; }
npm run build
npx cap sync android
(cd android && ./gradlew assembleRelease --no-daemon -q)
APK=android/app/build/outputs/apk/release/app-release.apk
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | tail -1)
if "$BT/aapt2" dump permissions "$APK" | grep -q android.permission.INTERNET; then echo "APK declares INTERNET"; exit 1; fi
"$BT/apksigner" verify --print-certs "$APK" | grep SHA-256
VERSION=$("$BT/aapt2" dump badging "$APK" | grep -o "versionName='[^']*'" | cut -d"'" -f2)
mkdir -p release && cp "$APK" "release/Inkmap-$VERSION.apk" && ls -l "release/Inkmap-$VERSION.apk"
