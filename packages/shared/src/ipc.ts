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
