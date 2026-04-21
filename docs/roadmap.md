# Roadmap

The Wren roadmap. Dates are targets, not promises — early-access product.
Last updated: 2026-04-22.

## Shipped (v0.1.0)

See [Changelog](./changelog.md). Highlights: BYOK for 4 providers, agentic mode with durable snapshots, context bridge, browser bridge (Chrome + Firefox), multi-chat accordion, CLI subscription bridge.

## Next (v0.2.x — 2026-Q2)

- **Chrome Web Store + Firefox Add-ons submission** — currently developer-mode sideload
- **DMG installer for macOS** — waiting on upstream `hdiutil` fix in `electron-builder` for macOS 15+ hosts
- **Signed builds** — Apple notarization + Windows code signing cert
- **Settings: API key import from `.env`** — paste or pick-file, auto-detect `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`
- **Cost dashboard persistence** — current cost tracker is session-scoped; persist per-project running total
- **Prompt library** — reusable prompt snippets scoped per project

## Later (v0.3.x — 2026-Q3)

- **Team tier server components**
  - SSO / SAML
  - Shared encrypted vault (team-owned keys with per-user access control)
  - Remote audit log aggregation
- **Workspace sync**: opt-in cloud sync for project config (not code)
- **Deeper agentic tools**: grep across project, git-aware diff tool, test runner integration
- **Plugin system** (exploratory): third-party tool providers

## Maybe / research

- **Self-hosted inference** — deeper Ollama integration, local embeddings for project-aware recall
- **Voice-in / voice-out** — Whisper + TTS piped into chat
- **Mobile companion** — remote chat-only client that speaks IPC to the desktop app

## Not planned

- **Cloud-hosted Wren** — the product premise is local-first BYOK; there is no plan to run inference on our servers
- **Built-in marketplace charges** — no take on top of provider API spend
