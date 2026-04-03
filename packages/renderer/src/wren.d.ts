import type { WrenApi } from "@wren/preload";

declare global {
  interface Window {
    wren: WrenApi;
  }
}

// CSS Modules
declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}
