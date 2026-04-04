# Wren Nexus Bridge — Store Listing Assets

## Chrome Web Store

### Basic Info

| Field | Value |
|-------|-------|
| Name | Wren Nexus Bridge |
| Short description (132 chars max) | Connects Wren IDE to your browser for live preview and network inspection. No data leaves your machine. |
| Version | 0.1.0 |
| Category | Developer Tools |
| Language | English (US) |

### Detailed Description (up to 16,000 characters)

```
Wren Nexus Bridge is the companion extension for Wren IDE — a BYOK-first, multi-provider AI desktop IDE.

This extension creates a secure local communication channel between the Wren desktop app and your browser, enabling:

• Live Preview — open and control browser windows directly from the Wren IDE canvas
• Network Inspection — forward request/response events from Wren-managed tabs back to the IDE
• Native Messaging — direct, low-latency IPC via Chrome's native messaging host (no cloud relay)

PRIVACY & SECURITY
• Zero telemetry — this extension never sends data to any remote server
• Local-only communication via localhost native messaging host (com.wren.bridge)
• Only controls browser windows explicitly opened by Wren — cannot access your existing tabs
• Open source: https://github.com/wren-ide/wren

REQUIREMENTS
• Wren IDE desktop app installed (https://wren.dev)
• Native messaging host installed via: npx wren-bridge install
```

### Privacy Policy URL

https://wren.dev/privacy

### Screenshots Required

| Size | Count | Notes |
|------|-------|-------|
| 1280×800 or 640×400 | at least 1, up to 5 | Show popup connected state, live preview in action |
| 440×280 (small promo tile) | optional | |
| 920×680 (marquee promo) | optional | |

**TODO (requires human action):** Take screenshots of the extension popup and live preview workflow.
Suggested shots:
1. Extension popup showing "Connected" status (dot green)
2. Wren IDE with live preview panel open in browser
3. Network inspection panel in Wren showing forwarded requests

### Icons

- 16×16: `packages/browser-bridge/icons/icon16.png` ✓
- 48×48: `packages/browser-bridge/icons/icon48.png` ✓
- 128×128: `packages/browser-bridge/icons/icon128.png` ✓

### Submission Checklist

- [ ] **$5 one-time developer account fee** (requires human: credit card)
- [ ] Register at https://chrome.google.com/webstore/devconsole
- [ ] Upload `packages/browser-bridge/dist/wren-nexus-bridge-0.1.0.zip`
- [ ] Add screenshots (1280×800)
- [ ] Set privacy policy URL to https://wren.dev/privacy
- [ ] Submit for review (typically 1–7 business days)

---

## Firefox Add-ons (addons.mozilla.org)

### Notes on MV3 Compatibility

Firefox 109+ fully supports Manifest V3. **No MV2 downgrade needed.**

Key differences handled in `manifest.firefox.json`:
- `background.service_worker` replaced with `background.scripts` + `"type": "module"` (Firefox MV3 syntax)
- Added `browser_specific_settings.gecko.id` = `nexus-bridge@wren.dev`
- `strict_min_version`: `109.0`

The `chrome.*` namespace works in Firefox via the built-in compatibility shim.

### Submission Checklist

- [ ] Create account at https://addons.mozilla.org/developers/
- [ ] Upload `packages/browser-bridge/dist/wren-nexus-bridge-0.1.0-firefox.zip`
- [ ] Provide source code zip for review (AMO requires it for obfuscation checks)
- [ ] Set homepage to https://wren.dev
- [ ] Submit for review

---

## GitHub Release

Tag: `v0.1.0`
Assets to attach:
- `dist/Wren-0.1.0-arm64.dmg` — macOS Apple Silicon
- `dist/Wren-0.1.0.dmg` — macOS Intel
- `packages/browser-bridge/dist/wren-nexus-bridge-0.1.0.zip` — Chrome extension
- `packages/browser-bridge/dist/wren-nexus-bridge-0.1.0-firefox.zip` — Firefox extension

_Windows (.exe) and Linux (.AppImage/.deb) require CI build on respective platforms._
