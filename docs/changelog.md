# Changelog

All notable changes to Wren IDE are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [0.1.0] — 2026-04-22

First public early-access release.

### Added

- **Core IDE**
  - Electron shell with Monaco editor, integrated terminal (xterm + node-pty), file tree, project switcher
  - Multi-project workspace: open multiple codebases in parallel with isolated AI state per project
  - Context-isolated renderer (`contextIsolation: true`, `nodeIntegration: false`) with typed IPC

- **AI Providers (BYOK)**
  - Anthropic Claude (`claude-sonnet-4-6`, Opus, Haiku)
  - OpenAI (GPT-4o, GPT-4o-mini, o1-mini)
  - Google Gemini (1.5 Pro, 2.0 Flash)
  - Mistral (Large, Medium, Small, Codestral)
  - Ollama (local inference via `localhost:11434`, auto-discovery of installed models)
  - Keys stored locally via Electron `safeStorage` (OS keychain); never proxied

- **Agentic Mode**
  - Multi-step autonomous tasks using the `read_file` / `write_file` / `delete_file` / `list_directory` / `run_command` tool set
  - Per-action approval (manual / selective / auto)
  - Automatic snapshot capture before every mutating action
  - One-click rollback (LIFO) or `rollback_to(snapshot_id)`
  - **Snapshot persistence** with 30-day retention (Pro tier advertising)
  - Settings → Snapshots: browse + "Rollback to here" per snapshot (IPC `agentic:list-snapshots`)

- **Context Bridge**
  - Switch AI provider mid-conversation without losing history
  - Tool-use content stripped when migrating to a non-tool-capable provider

- **Browser Bridge**
  - Companion Chrome + Firefox extension (`packages/browser-bridge`) opens a real browser window
  - DOM inspection, click, navigate, reload, console reads via WebSocket bridge
  - Packaged zips ready for store submission

- **Multi-Chat Accordion**
  - Parallel chat sessions per project, each bound to its own provider / model / alias

- **Subscription Chat via CLI**
  - Drive Claude Code and OpenAI Codex CLIs from inside Wren (no API cost on top of existing subscription)
  - Stream JSON parsed and rendered in chat

- **License & Tiers**
  - Free (1 project), Pro (unlimited projects, 30-day snapshot history), Team (audit logs, shared vault metadata)
  - Offline-first validator; expiry enforced client-side

- **Audit log**
  - Append-only JSONL at `<userData>/wren-audit.log`
  - Rotation at 5 MB, 10 archives max, 90-day retention
  - Tail API (`audit:tail` IPC channel) wired into Settings → Audit tail-200 viewer

- **License gating**
  - Free-tier project cap enforced on the TabBar `+` button with an inline upgrade hint that deep-links to Settings → License via the `wren:open-settings` window event

- **Browser Bridge install flow**
  - Settings → Bridge: install instructions + direct Chrome / Firefox download buttons pointing at the release assets

- **`.env` import**
  - Settings → Providers → "Import from .env file…" parses the file, detects `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY` (plus common aliases) and bulk-stores them in the vault with validation

- **Prompt library**
  - Settings → Prompts: reusable snippets with title + body, scoped global or per-project, with copy / edit / delete; persisted in localStorage

- **Cost dashboard**
  - Retention extended to 90 days (was 30); All-time view label updated

- **Auto-update**
  - `electron-updater` wired for generic provider; set `WREN_UPDATE_URL` to enable

### Platforms shipped in this release

- macOS 11+ (Apple Silicon — `.zip`, Intel — `.zip`)
- Windows 10+ (x64 — `.zip` portable)
- Linux (x64 — `.AppImage`)

### Known limitations

- Chrome extension requires developer-mode sideload (Web Store submission in progress)
- `.dmg` target temporarily disabled — `hdiutil` incompatibility on macOS 15+ hosts; `.zip` is the recommended macOS distribution channel for 0.1.x
- SSO / SAML advertised on the Team tier is planned; server component not yet shipped
