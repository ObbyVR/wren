# API Reference — IPC channels

Wren's renderer talks to the main process through a typed IPC surface defined
in [`packages/shared/src/ipc.ts`](../packages/shared/src/ipc.ts). Every channel has a declared request and response shape; the `window.wren.invoke(channel, payload)` helper infers both from the `IpcChannelMap` type.

Categories below summarise what each channel family does. Refer to `ipc.ts` for exact payload shapes.

## App

| Channel | Purpose |
|---|---|
| `app:get-version` | Return the running Wren version string |
| `app:ping` | Round-trip echo (dev diagnostic) |

## Filesystem

| Channel | Purpose |
|---|---|
| `fs:readdir` | List directory entries (`FileEntry[]`) |
| `fs:readfile` | Read a file's UTF-8 content |
| `fs:writefile` | Write a file (overwrite) |

## Terminal

| Channel | Purpose |
|---|---|
| `terminal:create` | Spawn a PTY inside `cwd` |
| `terminal:input` | Push keystrokes to a PTY |
| `terminal:resize` | Forward window resize |
| `terminal:destroy` | Kill a PTY |

The main process emits `terminal:data` and `terminal:exit` back through `window.wren.on`.

## Project

| Channel | Purpose |
|---|---|
| `project:open` | Add a folder as a project |
| `project:close` | Remove a project from the workspace |
| `project:list` | Enumerate open projects |
| `project:update` | Persist `activeFile`, `openFiles`, default model |
| `project:set-provider-profile` | Bind a provider/alias to a project |
| `dialog:open-folder` | Native folder picker |

## AI (BYOK)

| Channel | Purpose |
|---|---|
| `ai:get-key-status` | Legacy Claude-only check |
| `ai:set-key` | Store Claude key (legacy) |
| `ai:remove-key` | Remove Claude key (legacy) |
| `ai:send-message` | Stream a chat turn for the given project session |
| `ai:cancel` | Cancel an in-flight stream |

Streaming chunks arrive on `ai:stream-chunk`, `ai:stream-tool-call`, `ai:stream-tool-result`, `ai:stream-done`, `ai:stream-error`.

## Credential vault

| Channel | Purpose |
|---|---|
| `credentials:list` | List all aliases across providers |
| `credentials:set` | Store a labelled key |
| `credentials:remove` | Delete a key |
| `credentials:set-meta` | Update label / last-used metadata |

Keys are encrypted via Electron `safeStorage` before persistence at `<userData>/wren-keys.json`.

## Agentic engine

| Channel | Purpose |
|---|---|
| `agentic:readFile` / `writeFile` / `deleteFile` / `runCommand` / `listDir` | Tool primitives the model can drive |
| `agentic:rollback` | Undo the last snapshot |
| `agentic:rollbackTo` | Unwind to a specific snapshot id |
| `agentic:get-log` / `clear-log` | Inspect / clear the action log |
| `agentic:get-approval-mode` / `set-approval-mode` | `manual` / `selective` / `auto` |
| `agentic:get-settings` / `set-settings` | Persist `maxActionsPerSession`, `autoSnapshot`, etc. |
| `agentic:approve` / `agentic:reject` | Respond to an approval request |

The main process emits `agentic:approval-request` when user consent is required.

## Context bridge

Context preservation during provider switch is implemented inside `ai-handlers` via `transferContext(history, fromProvider, toProvider)`. No dedicated channel is exposed — switching provider simply re-dispatches the next `ai:send-message` with a new provider id; history is transformed server-side.

## Browser Bridge

| Channel | Purpose |
|---|---|
| `bridge:open-preview` | Ask the extension to open a URL in a tracked window |
| `bridge:close-preview` / `resize-preview` / `navigate-preview` / `reload-preview` | Control an opened window |
| `bridge:get-status` | Extension connection state |
| `bridge:list-windows` | Enumerate tracked browser windows |

The extension connects to a local WebSocket server started by `BridgeManager`.

## License

| Channel | Purpose |
|---|---|
| `license:get-status` | Active tier + expiry |
| `license:activate` | Validate + store a license key |
| `license:deactivate` | Return to Free tier |
| `license:get-limits` | Per-tier numeric limits |

## Telemetry

| Channel | Purpose |
|---|---|
| `telemetry:get-settings` | Read opt-in state |
| `telemetry:set-opted-in` | Toggle |

No telemetry is sent unless the user opts in.

## Audit log

| Channel | Purpose |
|---|---|
| `audit:tail` | Tail the JSONL audit log (most recent `limit` entries) |

The file lives at `<userData>/wren-audit.log`. Entries are plain JSON objects with `timestamp` + `event` + arbitrary extras (e.g. `provider`, `alias`, `snapshotId`). Rotation at 5 MB, 10-file history, 90-day retention.

## Preview server

| Channel | Purpose |
|---|---|
| `preview:get-file-server-port` | Discover the loopback port that serves project files for the embedded webview |

## Chat WebContentsView

| Channel | Purpose |
|---|---|
| `chat-view:create` | Mount a provider-site webview (subscription mode) |
| `chat-view:resize` / `set-visible` / `destroy` | Layout control |
