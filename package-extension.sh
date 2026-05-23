#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$ROOT_DIR/FABXTension"
DIST_DIR="$ROOT_DIR/distribution"
BUILD_DIR="$DIST_DIR/build"
TMP_DIR="$BUILD_DIR/tmp"

DEFAULT_FIREFOX_ID="fabxtension@sulifoj.local"
FIREFOX_ID="${FIREFOX_EXTENSION_ID:-$DEFAULT_FIREFOX_ID}"

usage() {
    cat <<'EOF'
Usage:
  ./package-extension.sh [--firefox-id addon@example.com]

Description:
  Generates two ZIP files ready for Chrome Web Store and Firefox Add-ons.

Outputs:
  distribution/build/FABXTension-chrome.zip
  distribution/build/FABXTension-firefox.zip

Tip:
  Default Firefox ID: fabxtension@sulifoj.local
  You can override it with --firefox-id or FIREFOX_EXTENSION_ID.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --firefox-id)
            shift
            if [[ $# -eq 0 ]]; then
                echo "Error: --firefox-id requires a value." >&2
                exit 1
            fi
            FIREFOX_ID="$1"
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "Error: unknown argument '$1'." >&2
            usage
            exit 1
            ;;
    esac
    shift
done

if [[ ! -d "$SRC_DIR" ]]; then
    echo "Error: source directory not found: $SRC_DIR" >&2
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Error: node is required to patch manifests for store packaging." >&2
    exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
    echo "Error: zip command is required." >&2
    exit 1
fi

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/chrome" "$TMP_DIR/firefox" "$BUILD_DIR"

cp -R "$SRC_DIR"/. "$TMP_DIR/chrome"/
cp -R "$SRC_DIR"/. "$TMP_DIR/firefox"/

find "$TMP_DIR" -name '.DS_Store' -delete

patch_manifest() {
    local target="$1"
    local manifest_path="$2"
    local firefox_id="$3"

    node -e '
const fs = require("fs");
const target = process.argv[1];
const manifestPath = process.argv[2];
const firefoxId = process.argv[3];

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const background = manifest.background || {};
const serviceWorker = typeof background.service_worker === "string" ? background.service_worker : null;

if (target === "chrome") {
  if (manifest.background && Object.prototype.hasOwnProperty.call(manifest.background, "scripts")) {
    delete manifest.background.scripts;
  }

  if (Object.prototype.hasOwnProperty.call(manifest, "browser_specific_settings")) {
    delete manifest.browser_specific_settings;
  }
}

if (target === "firefox") {
  manifest.background = manifest.background || {};
  if (!Array.isArray(manifest.background.scripts)) {
    const fallbackScript = serviceWorker || "events.js";
    manifest.background.scripts = [fallbackScript];
  }

  manifest.browser_specific_settings = manifest.browser_specific_settings || {};
  manifest.browser_specific_settings.gecko = manifest.browser_specific_settings.gecko || {};
  manifest.browser_specific_settings.gecko.strict_min_version = manifest.browser_specific_settings.gecko.strict_min_version || "102.0";

  manifest.browser_specific_settings.gecko_android = manifest.browser_specific_settings.gecko_android || {};
  manifest.browser_specific_settings.gecko_android.strict_min_version = manifest.browser_specific_settings.gecko_android.strict_min_version || "102.0";

  manifest.browser_specific_settings.gecko.id = firefoxId;

  if (!manifest.browser_specific_settings.gecko.data_collection_permissions) {
    manifest.browser_specific_settings.gecko.data_collection_permissions = {
      required: ["none"]
    };
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
' "$target" "$manifest_path" "$firefox_id"
}

patch_manifest "chrome" "$TMP_DIR/chrome/manifest.json" ""
patch_manifest "firefox" "$TMP_DIR/firefox/manifest.json" "$FIREFOX_ID"

CHROME_ZIP="$BUILD_DIR/FABXTension-chrome.zip"
FIREFOX_ZIP="$BUILD_DIR/FABXTension-firefox.zip"

rm -f "$CHROME_ZIP" "$FIREFOX_ZIP"

(
    cd "$TMP_DIR/chrome"
    zip -rq "$CHROME_ZIP" .
)

(
    cd "$TMP_DIR/firefox"
    zip -rq "$FIREFOX_ZIP" .
)

echo "Build complete:"
echo "  - $CHROME_ZIP"
echo "  - $FIREFOX_ZIP"

echo "  - Firefox gecko.id: $FIREFOX_ID"
