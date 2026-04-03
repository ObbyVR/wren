/**
 * Dev orchestrator: starts Vite for the renderer, then launches Electron
 * with NODE_ENV=development so main loads the Vite dev server URL.
 *
 * Usage: pnpm dev
 */

import { spawn } from "child_process";
import { createServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function main() {
  // 1. Start Vite dev server for renderer
  const vite = await createServer({
    root: path.join(ROOT, "packages/renderer"),
    server: { port: 5173, strictPort: true },
  });
  await vite.listen();
  console.log("[dev] Vite renderer running on http://localhost:5173");

  // 2. Build main + preload once before starting Electron
  await new Promise((resolve, reject) => {
    const tsc = spawn(
      "pnpm",
      [
        "--filter",
        "@wren/shared",
        "--filter",
        "@wren/preload",
        "--filter",
        "@wren/main",
        "-r",
        "run",
        "build",
      ],
      { cwd: ROOT, stdio: "inherit", shell: true },
    );
    tsc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tsc exit ${code}`))));
  });

  // 3. Launch Electron
  const electron = spawn(
    "npx",
    ["electron", path.join(ROOT, "packages/main/dist/index.js")],
    {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, NODE_ENV: "development" },
    },
  );

  electron.on("close", async () => {
    await vite.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    electron.kill();
    await vite.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
