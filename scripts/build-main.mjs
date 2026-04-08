/**
 * Bundle the Electron main process with esbuild.
 *
 * Resolves all workspace (@wren/*) and npm dependencies at build time
 * into a single file, so electron-builder doesn't need to find them
 * in node_modules (pnpm hoisting issue).
 *
 * Externals:
 *  - electron (provided by Electron runtime)
 *  - node-pty (native module, loaded from asarUnpack)
 */
import { build } from "esbuild";

await build({
  entryPoints: ["packages/main/dist/index.js"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "packages/main/dist/bundle.js",
  sourcemap: true,
  external: [
    "electron",
    "node-pty",
  ],
});

console.log("✓ Main process bundled → packages/main/dist/bundle.js");
