#!/bin/bash
# Wraps the web extension in an Xcode project with macOS + iOS app targets.
# Requires full Xcode (not just Command Line Tools):
#   1. Install Xcode from the App Store
#   2. sudo xcode-select -s /Applications/Xcode.app
#   3. ./make-app.sh
set -euo pipefail
cd "$(dirname "$0")"

xcrun safari-web-extension-converter extension \
  --project-location app \
  --app-name Blinks \
  --bundle-identifier online.bobbby.Blinks \
  --copy-resources \
  --force \
  --no-open

echo
echo "Done. Open app/Blinks/Blinks.xcodeproj in Xcode."
