#!/usr/bin/env bash
# Installs the Wren Nexus Bridge native messaging host manifest for Chrome.
#
# Usage:
#   ./install.sh <chrome-extension-id>
#
# Example:
#   ./install.sh abcdefghijklmnopabcdefghijklmnop
#
# After installation, reload the Chrome extension and restart Wren.

set -euo pipefail

EXTENSION_ID="${1:-}"
if [[ -z "$EXTENSION_ID" ]]; then
  echo "Usage: $0 <chrome-extension-id>"
  echo ""
  echo "You can find the extension ID in chrome://extensions after loading the extension."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/wren-bridge.js"

# Make the host script executable
chmod +x "$HOST_SCRIPT"

# Determine the NativeMessaging hosts directory
if [[ "$OSTYPE" == "darwin"* ]]; then
  HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  HOST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
else
  echo "Unsupported OS: $OSTYPE"
  echo "On Windows, register the manifest path in the registry under:"
  echo "  HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.wren.bridge"
  exit 1
fi

mkdir -p "$HOST_DIR"

MANIFEST_DEST="$HOST_DIR/com.wren.bridge.json"

# Write the manifest with resolved absolute paths
cat > "$MANIFEST_DEST" <<EOF
{
  "name": "com.wren.bridge",
  "description": "Wren Nexus Bridge — native messaging host",
  "path": "$(which node)",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXTENSION_ID}/"
  ]
}
EOF

# We actually need to pass the script path as argument to node.
# Chrome native messaging calls the "path" binary directly. So we need a wrapper.
WRAPPER="$SCRIPT_DIR/wren-bridge-wrapper.sh"
cat > "$WRAPPER" <<WRAPPER_EOF
#!/usr/bin/env bash
exec "$(which node)" "$HOST_SCRIPT" "\$@"
WRAPPER_EOF
chmod +x "$WRAPPER"

# Update manifest to point to the wrapper
cat > "$MANIFEST_DEST" <<EOF
{
  "name": "com.wren.bridge",
  "description": "Wren Nexus Bridge — native messaging host",
  "path": "${WRAPPER}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXTENSION_ID}/"
  ]
}
EOF

echo "Native messaging host installed:"
echo "  Manifest: $MANIFEST_DEST"
echo "  Wrapper:  $WRAPPER"
echo "  Host:     $HOST_SCRIPT"
echo ""
echo "Next steps:"
echo "  1. Open chrome://extensions"
echo "  2. Load the unpacked extension from: $(dirname "$SCRIPT_DIR")"
echo "  3. Confirm the extension ID matches: $EXTENSION_ID"
echo "  4. Start Wren — the bridge will connect automatically"
