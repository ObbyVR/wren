import { contextBridge, ipcRenderer } from "electron";
import type {
  IpcChannel,
  IpcRequest,
  IpcResponse,
  AiStreamChunkEvent,
  AiStreamDoneEvent,
  AiStreamErrorEvent,
  BridgeStatus,
  BridgeNetworkEvent,
  AgenticApprovalRequest,
  AgenticActionDoneEvent,
} from "@wren/shared";

const wrenApi = {
  invoke: <C extends IpcChannel>(
    channel: C,
    ...args: IpcRequest<C> extends void ? [] : [IpcRequest<C>]
  ): Promise<IpcResponse<C>> => {
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponse<C>>;
  },

  // Push-based terminal output: main → renderer
  onTerminalData: (
    callback: (id: string, data: string) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, data: string) => {
      callback(id, data);
    };
    ipcRenderer.on("terminal:data", handler);
    return () => ipcRenderer.removeListener("terminal:data", handler);
  },

  onTerminalExit: (
    callback: (id: string, exitCode: number) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, exitCode: number) => {
      callback(id, exitCode);
    };
    ipcRenderer.on("terminal:exit", handler);
    return () => ipcRenderer.removeListener("terminal:exit", handler);
  },

  // Bridge push events: main → renderer
  onBridgePreviewOpened: (
    callback: (data: { wrenWindowId: string; chromeWindowId: number }) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { wrenWindowId: string; chromeWindowId: number },
    ) => {
      callback(data);
    };
    ipcRenderer.on("bridge:preview-opened", handler);
    return () => ipcRenderer.removeListener("bridge:preview-opened", handler);
  },

  onBridgePreviewClosed: (
    callback: (data: { wrenWindowId: string; reason?: string }) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { wrenWindowId: string; reason?: string },
    ) => {
      callback(data);
    };
    ipcRenderer.on("bridge:preview-closed", handler);
    return () => ipcRenderer.removeListener("bridge:preview-closed", handler);
  },

  onBridgePreviewError: (
    callback: (data: { wrenWindowId: string; error: string }) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { wrenWindowId: string; error: string },
    ) => {
      callback(data);
    };
    ipcRenderer.on("bridge:preview-error", handler);
    return () => ipcRenderer.removeListener("bridge:preview-error", handler);
  },

  onBridgeNetworkEvent: (
    callback: (data: { wrenWindowId: string; event: BridgeNetworkEvent }) => void,
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { wrenWindowId: string; event: BridgeNetworkEvent },
    ) => {
      callback(data);
    };
    ipcRenderer.on("bridge:network-event", handler);
    return () => ipcRenderer.removeListener("bridge:network-event", handler);
  },

  onBridgeStatusChanged: (callback: (status: BridgeStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: BridgeStatus) => {
      callback(status);
    };
    ipcRenderer.on("bridge:status-changed", handler);
    return () => ipcRenderer.removeListener("bridge:status-changed", handler);
  },

  // AI streaming events: main → renderer
  onAiStreamChunk: (callback: (event: AiStreamChunkEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AiStreamChunkEvent) => {
      callback(data);
    };
    ipcRenderer.on("ai:stream-chunk", handler);
    return () => ipcRenderer.removeListener("ai:stream-chunk", handler);
  },

  onAiStreamDone: (callback: (event: AiStreamDoneEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AiStreamDoneEvent) => {
      callback(data);
    };
    ipcRenderer.on("ai:stream-done", handler);
    return () => ipcRenderer.removeListener("ai:stream-done", handler);
  },

  onAiStreamError: (callback: (event: AiStreamErrorEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AiStreamErrorEvent) => {
      callback(data);
    };
    ipcRenderer.on("ai:stream-error", handler);
    return () => ipcRenderer.removeListener("ai:stream-error", handler);
  },

  // Agentic push events: main → renderer
  onAgenticApprovalRequest: (
    callback: (data: AgenticApprovalRequest) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgenticApprovalRequest) => {
      callback(data);
    };
    ipcRenderer.on("agentic:approval-request", handler);
    return () => ipcRenderer.removeListener("agentic:approval-request", handler);
  },

  onAgenticActionDone: (
    callback: (data: AgenticActionDoneEvent) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgenticActionDoneEvent) => {
      callback(data);
    };
    ipcRenderer.on("agentic:action-done", handler);
    return () => ipcRenderer.removeListener("agentic:action-done", handler);
  },
};

export type WrenApi = typeof wrenApi;

contextBridge.exposeInMainWorld("wren", wrenApi);
