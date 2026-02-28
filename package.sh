#!/bin/bash
# Package ClaudeFox for AMO submission
# Creates claudefox-v{version}.zip ready for upload

set -e

cd "$(dirname "$0")"

# Read version from manifest
VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUTFILE="claudefox-v${VERSION}.zip"

# Remove old package if exists
rm -f "$OUTFILE"

# Package only the files AMO needs
zip -r "$OUTFILE" \
  manifest.json \
  background.js \
  content.js \
  sidebar/ \
  options/ \
  icons/ \
  lib/ \
  LICENSE \
  -x "*.DS_Store" \
  -x "__MACOSX/*"

echo ""
echo "Packaged: $OUTFILE ($(du -h "$OUTFILE" | cut -f1))"
echo ""
echo "Upload this file to: https://addons.mozilla.org/developers/addon/submit/"
echo ""
echo "AMO will ask for:"
echo "  1. Category: 'Search Tools' or 'Other'"
echo "  2. License: MIT"
echo "  3. Source code: Not required (no build step)"
echo "  4. Privacy policy URL: Host PRIVACY.md somewhere or paste its contents"
