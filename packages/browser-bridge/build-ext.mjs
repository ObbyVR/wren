/**
 * Build script: packages the browser-bridge extension into a .zip
 * ready for Chrome Web Store or Firefox Add-ons upload.
 *
 * Usage:
 *   pnpm --filter @wren/browser-bridge build:ext            # Chrome (default)
 *   pnpm --filter @wren/browser-bridge build:ext -- --firefox  # Firefox
 *
 * Output:
 *   dist/wren-nexus-bridge-<version>.zip          (Chrome)
 *   dist/wren-nexus-bridge-<version>-firefox.zip  (Firefox)
 */

import { createWriteStream, readFileSync, mkdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const __dir = dirname(fileURLToPath(import.meta.url));

const isFirefox = process.argv.includes("--firefox");
const manifestFile = isFirefox ? "manifest.firefox.json" : "manifest.json";

const manifest = JSON.parse(
  readFileSync(resolve(__dir, manifestFile), "utf8")
);

const version = manifest.version;
const outDir = resolve(__dir, "dist");
const suffix = isFirefox ? `-firefox` : "";
const outFile = resolve(outDir, `wren-nexus-bridge-${version}${suffix}.zip`);

mkdirSync(outDir, { recursive: true });

// Files/dirs to include in the extension zip
const INCLUDE = [
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

// Always include the manifest as "manifest.json" regardless of source filename
archive.append(readFileSync(resolve(__dir, manifestFile)), { name: "manifest.json" });

for (const entry of INCLUDE) {
  const abs = resolve(__dir, entry);
  try {
    const stat = statSync(abs);
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
