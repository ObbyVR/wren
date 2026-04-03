import type { WrenApi } from "@wren/preload";

declare global {
  interface Window {
    wren: WrenApi;
  }
}
