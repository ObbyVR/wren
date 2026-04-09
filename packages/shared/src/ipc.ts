// Type-safe IPC channel definitions shared between main, preload, and renderer

export type IpcChannel = keyof IpcChannelMap;

// ── Agentic Engine types ───────────────────────────────────────────────────────

export type ApprovalMode = "manual" | "auto" | "selective";

export type AgenticActionType =
  | "readFile"
  | "writeFile"
  | "deleteFile"
  | "runCommand"
  | "listDir"
  | "rollback";

export interface AgenticAction {
  id: string;
  type: AgenticActionType;
  path?: string;
  command?: string;
  snapshotId?: string;
  status: "success" | "error";
  error?: string;
  timestamp: number;
}

export interface AgenticSnapshot {
  id: string;
  type: "writeFile" | "deleteFile";
  path: string;
  /** Original file content; null means the file did not exist before the action */
  originalContent: string | null;
  timestamp: number;
}

export interface AgenticRunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Emitted by main → renderer when an action needs user approval */
export interface AgenticApprovalRequest {
  requestId: string;
  projectId: string;
  action: AgenticActionType;
  path?: string;
  command?: string;
  /** Unified diff for writeFile actions */
  diff?: string;
}

/** Push event emitted by main → renderer when an action completes */
export interface AgenticActionDoneEvent {
  projectId: string;
  action: AgenticAction;
}

/** Settings stored per project for the agentic engine */
export interface AgenticSettings {
  approvalMode: ApprovalMode;
  maxActionsPerSession: number;
  autoSnapshot: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface IpcChannelMap {
  "app:get-version": {
    request: void;
    response: string;
  };
  "app:ping": {
    request: string;
    response: string;
  };

  // Filesystem
  "fs:readdir": {
    request: string; // absolute dir path
    response: FileEntry[];
  };
  "fs:readfile": {
    request: string; // absolute file path
    response: string; // utf-8 content
  };
  "fs:writefile": {
    request: { path: string; content: string };
    response: void;
  };

  // Terminal (PTY)
  "terminal:create": {
    request: { cwd: string };
    response: { id: string };
  };
  "terminal:input": {
    request: { id: string; data: string };
    response: void;
  };
  "terminal:resize": {
    request: { id: string; cols: number; rows: number };
    response: void;
  };
  "terminal:destroy": {
    request: { id: string };
    response: void;
  };

  // AI — key management
  "ai:get-key-status": {
    request: void;
    response: { hasKey: boolean };
  };
  "ai:set-key": {
    request: { key: string };
    response: { valid: boolean; error?: string };
  };
  "ai:remove-key": {
    request: void;
    response: void;
  };

  // AI — models
  "ai:list-models": {
    request: void;
    response: AiModel[];
  };

  // AI — chat (starts streaming; chunks arrive via IPC events on the window)
  "ai:send-message": {
    request: AiSendMessagePayload;
    response: void;
  };

  // AI — multi-provider management
  "ai:list-providers": {
    request: void;
    response: AiProviderInfo[];
  };

  "ai:set-provider": {
    request: { providerId: string; key: string; alias?: string };
    response: { valid: boolean; error?: string };
  };

  "ai:validate-key": {
    request: { providerId: string; key: string };
    response: { valid: boolean; error?: string };
  };

  "ai:remove-provider-key": {
    request: { providerId: string; alias?: string };
    response: void;
  };

  "ai:transfer-context": {
    request: AiTransferContextPayload;
    response: AiTransferContextResult;
  };

  // Project config — maps project to provider/model/account
  "project:get-config": {
    request: { projectId: string };
    response: ProjectConfig | null;
  };

  "project:set-config": {
    request: { projectId: string; config: ProjectConfig };
    response: void;
  };

  // Project management (tab system — open/close/list projects)
  "project:open": {
    request: { path: string };
    response: ProjectInfo;
  };
  "project:close": {
    request: { id: string };
    response: void;
  };
  "project:list": {
    request: void;
    response: ProjectInfo[];
  };
  "project:update": {
    request: { id: string; activeFile?: string | null; openFiles?: string[]; model?: string };
    response: ProjectInfo;
  };

  // System dialogs
  "dialog:open-folder": {
    request: void;
    response: string | null;
  };

  // Agentic Engine — file actions
  "agentic:readFile": {
    request: { projectId: string; path: string };
    response: string;
  };
  "agentic:writeFile": {
    request: { projectId: string; path: string; content: string };
    response: { snapshotId: string };
  };
  "agentic:deleteFile": {
    request: { projectId: string; path: string };
    response: { snapshotId: string };
  };
  "agentic:runCommand": {
    request: { projectId: string; command: string; cwd?: string };
    response: AgenticRunCommandResult;
  };
  "agentic:listDir": {
    request: { projectId: string; path: string };
    response: FileEntry[];
  };

  // Agentic Engine — rollback
  "agentic:rollback": {
    request: { projectId: string };
    response: { snapshotId: string; path: string };
  };
  "agentic:rollbackTo": {
    request: { projectId: string; snapshotId: string };
    response: { restoredCount: number };
  };

  // Agentic Engine — log
  "agentic:get-log": {
    request: { projectId: string };
    response: AgenticAction[];
  };
  "agentic:clear-log": {
    request: { projectId: string };
    response: void;
  };

  // Agentic Engine — approval mode
  "agentic:get-approval-mode": {
    request: { projectId: string };
    response: ApprovalMode;
  };
  "agentic:set-approval-mode": {
    request: { projectId: string; mode: ApprovalMode };
    response: void;
  };

  // Agentic Engine — approve / reject a pending action
  "agentic:approve": {
    request: { requestId: string; projectId: string };
    response: void;
  };
  "agentic:reject": {
    request: { requestId: string; projectId: string };
    response: void;
  };

  // Agentic Engine — settings (approval mode + safety limits)
  "agentic:get-settings": {
    request: { projectId: string };
    response: AgenticSettings;
  };
  "agentic:set-settings": {
    request: { projectId: string; settings: Partial<AgenticSettings> };
    response: AgenticSettings;
  };

  // Git — core operations
  "git:status": {
    request: { repoPath: string };
    response: GitStatus;
  };
  "git:diff": {
    request: { repoPath: string; staged?: boolean; filePath?: string };
    response: GitDiff;
  };
  "git:stage": {
    request: { repoPath: string; paths: string[] };
    response: void;
  };
  "git:unstage": {
    request: { repoPath: string; paths: string[] };
    response: void;
  };
  "git:commit": {
    request: { repoPath: string; message: string };
    response: CommitResult;
  };
  "git:push": {
    request: { repoPath: string; remote?: string; branch?: string; force?: boolean };
    response: void;
  };
  "git:pull": {
    request: { repoPath: string; remote?: string; branch?: string };
    response: { mergeResult: string };
  };
  "git:fetch": {
    request: { repoPath: string; remote?: string };
    response: void;
  };

  // Git — branches
  "git:list-branches": {
    request: { repoPath: string; includeRemote?: boolean };
    response: BranchInfo[];
  };
  "git:create-branch": {
    request: { repoPath: string; name: string; startPoint?: string };
    response: void;
  };
  "git:switch-branch": {
    request: { repoPath: string; name: string };
    response: void;
  };
  "git:delete-branch": {
    request: { repoPath: string; name: string; force?: boolean };
    response: void;
  };

  // Git — log
  "git:log": {
    request: { repoPath: string; maxCount?: number; branch?: string };
    response: GitLogEntry[];
  };

  // Git — GitHub OAuth
  "git:oauth-start": {
    request: { clientId?: string };
    response: { deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number };
  };
  "git:oauth-poll": {
    request: { deviceCode: string; interval: number };
    response: GitOAuthStatus;
  };
  "git:oauth-status": {
    request: void;
    response: GitOAuthStatus;
  };
  "git:oauth-logout": {
    request: void;
    response: void;
  };

  // Git — clone
  "git:clone": {
    request: { repoUrl: string; destPath: string; depth?: number };
    response: GitCloneResult;
  };

  // Git — stash
  "git:stash": {
    request: { repoPath: string; message?: string };
    response: void;
  };
  "git:stash-pop": {
    request: { repoPath: string };
    response: void;
  };

  // Credential Vault
  "credentials:list": {
    request: void;
    response: CredentialEntry[];
  };
  "credentials:set": {
    request: { providerId: string; alias: string; key: string; label?: string | undefined };
    response: { valid: boolean; error?: string };
  };
  "credentials:remove": {
    request: { providerId: string; alias: string };
    response: void;
  };
  "credentials:set-meta": {
    request: { providerId: string; alias: string; label: string };
    response: void;
  };

  // Project provider profile (which key alias to use per provider)
  "project:set-provider-profile": {
    request: { projectId: string; providerId: string; alias: string };
    response: void;
  };

  // Local file server port (for inline preview of AI-generated files)
  "preview:get-file-server-port": {
    request: void;
    response: number;
  };

  // Chat WebContentsView — embedded browser for subscription-based AI
  "chat-view:create": {
    request: { sessionId: string; providerId: string; bounds: ViewBounds };
    response: void;
  };
  "chat-view:resize": {
    request: { sessionId: string; bounds: ViewBounds };
    response: void;
  };
  "chat-view:set-visible": {
    request: { sessionId: string; visible: boolean };
    response: void;
  };
  "chat-view:destroy": {
    request: { sessionId: string };
    response: void;
  };

  // Browser Bridge — reload current preview page
  "bridge:reload-preview": {
    request: { wrenWindowId: string };
    response: void;
  };

  // License management
  "license:get-status": {
    request: void;
    response: LicenseStatus;
  };
  "license:activate": {
    request: { key: string };
    response: LicenseStatus;
  };
  "license:deactivate": {
    request: void;
    response: void;
  };
  "license:get-limits": {
    request: void;
    response: TierLimits;
  };

  // Telemetry settings
  "telemetry:get-settings": {
    request: void;
    response: TelemetrySettings;
  };
  "telemetry:set-opted-in": {
    request: { optedIn: boolean };
    response: void;
  };

  // Browser Bridge (Nexus Bridge)
  "bridge:open-preview": {
    request: BridgeOpenPreviewPayload;
    response: { wrenWindowId: string };
  };
  "bridge:close-preview": {
    request: { wrenWindowId: string };
    response: void;
  };
  "bridge:resize-preview": {
    request: BridgeResizePayload;
    response: void;
  };
  "bridge:navigate-preview": {
    request: { wrenWindowId: string; url: string };
    response: void;
  };
  "bridge:get-status": {
    request: void;
    response: BridgeStatus;
  };
  "bridge:list-windows": {
    request: void;
    response: BridgeWindowInfo[];
  };
}

export type IpcRequest<C extends IpcChannel> = IpcChannelMap[C]["request"];
export type IpcResponse<C extends IpcChannel> = IpcChannelMap[C]["response"];

// ── AI shared types ───────────────────────────────────────────────────────────

export interface AiModel {
  id: string;
  name: string;
  providerId: string;
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiSendMessagePayload {
  requestId: string;
  messages: AiMessage[];
  model: string;
  providerId?: string; // which provider to use; falls back to "claude" for compat
  accountAlias?: string; // which key alias to use; falls back to "default"
  sessionMode?: ChatSessionMode; // "subscription" uses CLI, "api" uses SDK, "browser" uses webview
  chatSessionId?: string; // accordion session ID for CLI session tracking
  systemPrompt?: string;
  agenticMode?: boolean;  // enables tool use + context injection
  projectRoot?: string;   // project root path for context injection & tool execution
  openFiles?: string[];   // currently open files to inject into context
}

export interface AiStreamChunkEvent {
  requestId: string;
  text: string;
}

export interface AiStreamDoneEvent {
  requestId: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiStreamErrorEvent {
  requestId: string;
  error: string;
}

// ── Agentic / tool-use stream events ─────────────────────────────────────────

export interface AiToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AiToolResult {
  toolCallId: string;
  name: string;
  output: string;
  isError?: boolean;
}

/** Emitted when the AI has issued a tool call and Wren is executing it */
export interface AiStreamToolCallEvent {
  requestId: string;
  toolCall: AiToolCall;
}

/** Emitted when a tool execution has completed */
export interface AiStreamToolResultEvent {
  requestId: string;
  toolResult: AiToolResult;
}

// ── Multi-provider types ──────────────────────────────────────────────────────

export type ProviderId = "anthropic" | "openai" | "gemini" | "ollama";

/** How a chat session connects to the AI provider */
export type ChatSessionMode = "subscription" | "api" | "browser";

/** State of a single chat session inside the accordion stack */
export interface ChatSessionState {
  id: string;
  providerId: ProviderId;
  modelId: string;
  label: string;
  collapsed: boolean;
  /** "browser" = embedded webview loading provider site, "api" = SDK-based chat */
  mode: ChatSessionMode;
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  /** API key stored in keychain — never serialised to disk */
  apiKey?: string;
  /** Last 6 chars of the key for display only */
  keyMasked?: string;
  defaultModel?: string;
  status: "valid" | "invalid" | "unchecked";
}

export interface ProjectTab {
  id: string;
  name: string;
  rootPath: string | null;
  providerId: ProviderId;
  modelId?: string;
  isPinned?: boolean;
}

export interface CostEntry {
  projectId: string;
  projectName: string;
  providerId: ProviderId;
  inputTokens: number;
  outputTokens: number;
  /** ISO date string YYYY-MM-DD for daily bucketing */
  date: string;
}

// ── Credential Vault types ────────────────────────────────────────────────────

export interface CredentialEntry {
  providerId: string;
  alias: string;
  label?: string | undefined;
  keyMasked: string;
  createdAt: number;
  lastUsedAt?: number | undefined;
}

// ── Multi-provider IPC types ───────────────────────────────────────────────────

export interface AiProviderInfo {
  id: string;
  name: string;
  aliases: string[]; // configured key aliases
  models: AiModel[];
}

export interface AiTransferContextPayload {
  messages: AiMessage[];
  fromProviderId: string;
  toProviderId: string;
}

export interface AiTransferContextResult {
  messages: AiMessage[];
  summary: string[];
  strippedCount: number;
}

// ── Project config ────────────────────────────────────────────────────────────

export interface ProjectConfig {
  providerId: string;
  accountAlias: string;
  model: string;
}

// ── Project management ────────────────────────────────────────────────────────

/** Represents an open project in the tab system */
export interface ProjectInfo {
  id: string;
  path: string;
  name: string;
  activeFile: string | null;
  openFiles: string[];
  aiProvider: string;
  model: string;
  approvalMode: ApprovalMode;
}

// ── Git types ─────────────────────────────────────────────────────────────────

export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored"
  | "conflicted";

export interface GitFileEntry {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  oldPath?: string; // for renamed files
}

export interface GitStatus {
  branch: string;
  tracking?: string;
  ahead: number;
  behind: number;
  files: GitFileEntry[];
  isRepo: boolean;
}

export interface GitDiffFile {
  path: string;
  hunks: GitDiffHunk[];
}

export interface GitDiffHunk {
  header: string;
  lines: GitDiffLine[];
}

export interface GitDiffLine {
  type: "context" | "add" | "remove";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface GitDiff {
  files: GitDiffFile[];
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
  lastCommit?: string;
}

export interface CommitResult {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitCloneResult {
  path: string;
  repoName: string;
}

export interface GitOAuthStatus {
  authenticated: boolean;
  username?: string;
  avatarUrl?: string;
  scopes?: string[];
}

// ── Chat WebContentsView types ────────────────────────────────────────────

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── Browser Bridge (Nexus Bridge) types ───────────────────────────────────────

export interface BridgeOpenPreviewPayload {
  wrenWindowId: string;
  url: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

export interface BridgeResizePayload {
  wrenWindowId: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

export interface BridgeWindowInfo {
  wrenWindowId: string;
  url: string;
  status: "open" | "loading" | "closed";
}

export interface BridgeStatus {
  connected: boolean;
  windowCount: number;
}

export interface BridgeNetworkEvent {
  requestId: string;
  type: "request" | "response" | "error";
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  duration?: number;
  error?: string;
  timestamp: number;
}

// ── License types ─────────────────────────────────────────────────────────────

export type LicenseTier = "free" | "pro" | "team";

export interface LicenseStatus {
  tier: LicenseTier;
  email: string;
  expiresAt: string | null;
  valid: boolean;
  reason?: string;
}

export interface TierLimits {
  maxProjects: number;
  maxProviders: number;
  sharedWorkspaces: boolean;
}

// ── Telemetry types ───────────────────────────────────────────────────────────

export interface TelemetrySettings {
  optedIn: boolean;
}

export type TelemetryEventName =
  | "app_launched"
  | "session_duration"
  | "provider_used";
