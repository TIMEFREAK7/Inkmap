#!/usr/bin/env bash
# Builds the Windows installer (Electron + NSIS). On Linux the installer step needs Wine (apt install wine64).
# Same version as the APK: 0.1.<commit count>.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="0.1.$(git rev-list --count HEAD)"
npm run build
npx electron-builder --win --x64 --publish never -c.extraMetadata.version="$VERSION"
ls -l "release/Inkmap-Setup-$VERSION.exe"
