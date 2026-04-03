// Type-safe IPC channel definitions shared between main, preload, and renderer

export type IpcChannel = keyof IpcChannelMap;

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
  systemPrompt?: string;
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

// ── Multi-provider types ──────────────────────────────────────────────────────

export type ProviderId = "anthropic" | "openai" | "gemini" | "ollama";

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
}
