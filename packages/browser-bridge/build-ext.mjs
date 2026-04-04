/**
 * Build script: packages the browser-bridge Chrome extension into a .zip
 * ready for Chrome Web Store upload.
 *
 * Usage:  pnpm --filter @wren/browser-bridge build:ext
 * Output: dist/wren-nexus-bridge-<version>.zip
 */

import { createWriteStream, readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const __dir = dirname(fileURLToPath(import.meta.url));

const manifest = JSON.parse(
  readFileSync(resolve(__dir, "manifest.json"), "utf8")
);

const version = manifest.version;
const outDir = resolve(__dir, "dist");
const outFile = resolve(outDir, `wren-nexus-bridge-${version}.zip`);

mkdirSync(outDir, { recursive: true });

// Files/dirs to include in the extension zip
const INCLUDE = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.html",
  "popup.js",
  "icons",
];

const output = createWriteStream(outFile);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  console.log(`✓ Extension packaged: ${outFile} (${kb} KB)`);
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);

for (const entry of INCLUDE) {
  const abs = resolve(__dir, entry);
  try {
    // Check if it's a directory by attempting to read as dir
    const stat = (await import("fs")).statSync(abs);
    if (stat.isDirectory()) {
      archive.directory(abs, entry);
    } else {
      archive.file(abs, { name: entry });
    }
  } catch {
    console.warn(`  ⚠ skipping missing entry: ${entry}`);
  }
}

await archive.finalize();
