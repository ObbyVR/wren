import { contextBridge, ipcRenderer } from "electron";
import type { IpcChannel, IpcRequest, IpcResponse } from "@wren/shared";

// Expose a type-safe IPC bridge to the renderer via window.wren
const wrenApi = {
  invoke: <C extends IpcChannel>(
    channel: C,
    ...args: IpcRequest<C> extends void ? [] : [IpcRequest<C>]
  ): Promise<IpcResponse<C>> => {
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponse<C>>;
  },
};

export type WrenApi = typeof wrenApi;

contextBridge.exposeInMainWorld("wren", wrenApi);
