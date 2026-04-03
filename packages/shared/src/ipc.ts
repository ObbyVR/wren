// Type-safe IPC channel definitions shared between main, preload, and renderer

export type IpcChannel = keyof IpcChannelMap;

export interface IpcChannelMap {
  // Example: renderer asks main for app version
  "app:get-version": {
    request: void;
    response: string;
  };
  // Example: renderer sends a ping, main responds with pong
  "app:ping": {
    request: string;
    response: string;
  };
}

export type IpcRequest<C extends IpcChannel> = IpcChannelMap[C]["request"];
export type IpcResponse<C extends IpcChannel> = IpcChannelMap[C]["response"];
