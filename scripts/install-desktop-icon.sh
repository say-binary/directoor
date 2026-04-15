#!/bin/bash
# Installs the Directoor Desktop launcher on macOS.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_APP="$SCRIPT_DIR/Directoor.app"
DEST_APP="$HOME/Desktop/Directoor.app"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister"

if [ ! -d "$SRC_APP" ]; then
    echo "ERROR: $SRC_APP not found"
    exit 1
fi

# 1. Unregister both source and destination from Launch Services to avoid conflicts
if [ -x "$LSREGISTER" ]; then
    "$LSREGISTER" -u "$SRC_APP" 2>/dev/null
    "$LSREGISTER" -u "$DEST_APP" 2>/dev/null
fi

# 2. Remove old version if present
if [ -d "$DEST_APP" ]; then
    rm -rf "$DEST_APP"
fi

# 3. Copy the .app bundle to Desktop
cp -R "$SRC_APP" "$DEST_APP"

# 4. Make the launcher executable (cp -R should preserve it, but be explicit)
chmod +x "$DEST_APP/Contents/MacOS/Directoor"

# 5. Strip ALL extended attributes (quarantine, FinderInfo, provenance — anything
#    that might cause Gatekeeper or Launch Services to refuse the bundle)
xattr -cr "$DEST_APP" 2>/dev/null

# 6. Force Launch Services to (re)register the Desktop copy
if [ -x "$LSREGISTER" ]; then
    "$LSREGISTER" -f "$DEST_APP"
fi

# 7. Force Finder to refresh the Desktop icon
touch "$HOME/Desktop"

echo "✓ Installed Directoor.app to ~/Desktop"
echo ""
echo "  Double-click it to launch the app in your browser."
echo ""
echo "  Auto-shutdown:"
echo "  - 60 seconds after browser is closed"
echo "  - 15 minutes of user inactivity"
echo ""
echo "  If macOS asks 'Are you sure you want to open it?', click Open."
echo "  This is normal for unsigned apps and only happens once."
