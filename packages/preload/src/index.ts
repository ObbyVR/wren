import { contextBridge, ipcRenderer } from "electron";
import type {
  IpcChannel,
  IpcRequest,
  IpcResponse,
  AiStreamChunkEvent,
  AiStreamDoneEvent,
  AiStreamErrorEvent,
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
};

export type WrenApi = typeof wrenApi;

contextBridge.exposeInMainWorld("wren", wrenApi);
