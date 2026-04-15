#!/bin/bash
# Installs the Directoor Desktop launcher.
# Copies (not symlinks) the .app bundle to ~/Desktop so macOS treats it as an app.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_APP="$SCRIPT_DIR/Directoor.app"
DEST_APP="$HOME/Desktop/Directoor.app"

if [ ! -d "$SRC_APP" ]; then
    echo "ERROR: $SRC_APP not found"
    exit 1
fi

# Remove old version if present
if [ -d "$DEST_APP" ]; then
    echo "Removing existing $DEST_APP"
    rm -rf "$DEST_APP"
fi

# Copy the .app bundle to Desktop
cp -R "$SRC_APP" "$DEST_APP"

# Ensure executable bits are preserved
chmod +x "$DEST_APP/Contents/MacOS/Directoor"

# Tell macOS to refresh its app database for this bundle
xattr -d com.apple.quarantine "$DEST_APP" 2>/dev/null || true
touch "$DEST_APP"

echo "✓ Installed Directoor.app to ~/Desktop"
echo "  Double-click it to launch the app in your browser."
echo ""
echo "  The server will auto-shutdown:"
echo "  - After 60 seconds of no browser activity (browser closed)"
echo "  - After 15 minutes of user inactivity"
