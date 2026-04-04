#!/usr/bin/env node
/**
 * gen-icons.mjs — generate all required app icon formats from build/icon.svg
 *
 * Usage:
 *   pnpm gen-icons
 *
 * Requires:
 *   - qlmanage / sips / iconutil  (macOS built-in, for .icns)
 *   - Inkscape or rsvg-convert    (optional, better SVG rendering)
 *   - ImageMagick convert         (optional, for .ico on non-mac)
 *
 * On macOS the script uses only built-in tools.
 * On Linux/Windows it requires  @resvg/resvg-js  (install with pnpm add -D @resvg/resvg-js).
 */

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BUILD = path.join(ROOT, "build");
const ICONS_DIR = path.join(BUILD, "icons");
const SVG_SRC = path.join(BUILD, "icon.svg");

const isMac = os.platform() === "darwin";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(" $", cmd);
  const result = spawnSync(cmd, { shell: true, stdio: "pipe", ...opts });
  if (result.status !== 0) {
    const err = result.stderr?.toString() || result.stdout?.toString() || "";
    throw new Error(`Command failed (exit ${result.status}): ${cmd}\n${err}`);
  }
  return result.stdout?.toString().trim();
}

function hasCmd(name) {
  const r = spawnSync("which", [name], { stdio: "pipe" });
  return r.status === 0;
}

// ─── SVG → PNG via macOS sips (via intermediate TIFF) or rsvg/inkscape ───────

async function svgToPng(srcSvg, destPng, size) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wren-icons-"));
  const tmpPng = path.join(tmpDir, `icon_${size}.png`);

  if (isMac && hasCmd("qlmanage")) {
    // qlmanage renders SVG to PNG on macOS
    run(`qlmanage -t -s ${size} -o "${tmpDir}" "${srcSvg}" 2>/dev/null || true`);
    const rendered = path.join(tmpDir, path.basename(srcSvg) + ".png");
    if (fs.existsSync(rendered)) {
      fs.copyFileSync(rendered, destPng);
      fs.rmSync(tmpDir, { recursive: true });
      return;
    }
  }

  if (hasCmd("rsvg-convert")) {
    run(`rsvg-convert -w ${size} -h ${size} -o "${destPng}" "${srcSvg}"`);
    fs.rmSync(tmpDir, { recursive: true });
    return;
  }

  if (hasCmd("inkscape")) {
    run(`inkscape --export-type=png --export-width=${size} --export-height=${size} --export-filename="${destPng}" "${srcSvg}"`);
    fs.rmSync(tmpDir, { recursive: true });
    return;
  }

  // Fallback: use @resvg/resvg-js if installed
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const svgData = fs.readFileSync(srcSvg, "utf8");
    const resvg = new Resvg(svgData, { fitTo: { mode: "width", value: size } });
    const pngData = resvg.render().asPng();
    fs.writeFileSync(destPng, pngData);
    fs.rmSync(tmpDir, { recursive: true });
    return;
  } catch {
    // not installed
  }

  fs.rmSync(tmpDir, { recursive: true });
  throw new Error(
    "No SVG→PNG renderer found.\n" +
    "On macOS: qlmanage (built-in) should work.\n" +
    "Otherwise install one of: rsvg-convert, inkscape, or `pnpm add -D @resvg/resvg-js`"
  );
}

// ─── Build .icns (macOS only) ─────────────────────────────────────────────────

async function buildIcns() {
  if (!isMac) { console.log("Skipping .icns (macOS only)"); return; }

  const iconsetDir = path.join(BUILD, "icon.iconset");
  fs.mkdirSync(iconsetDir, { recursive: true });

  const sizes = [16, 32, 64, 128, 256, 512];
  for (const s of sizes) {
    const dest1x = path.join(iconsetDir, `icon_${s}x${s}.png`);
    const dest2x = path.join(iconsetDir, `icon_${s}x${s}@2x.png`);
    console.log(`  generating ${s}x${s} …`);
    await svgToPng(SVG_SRC, dest1x, s);
    if (s * 2 <= 1024) {
      await svgToPng(SVG_SRC, dest2x, s * 2);
    }
  }

  const icnsOut = path.join(BUILD, "icon.icns");
  run(`iconutil -c icns -o "${icnsOut}" "${iconsetDir}"`);
  fs.rmSync(iconsetDir, { recursive: true });
  console.log("✓ icon.icns");
}

// ─── Build .ico (multi-size ICO) ─────────────────────────────────────────────

async function buildIco() {
  const icoPng = path.join(BUILD, "icon-256.png");
  await svgToPng(SVG_SRC, icoPng, 256);

  if (hasCmd("convert")) {
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const tmpPngs = [];
    for (const s of sizes) {
      const p = path.join(BUILD, `icon-${s}.png`);
      await svgToPng(SVG_SRC, p, s);
      tmpPngs.push(p);
    }
    const icoOut = path.join(BUILD, "icon.ico");
    run(`convert ${tmpPngs.join(" ")} "${icoOut}"`);
    for (const p of tmpPngs) fs.unlinkSync(p);
    console.log("✓ icon.ico (ImageMagick, multi-size)");
  } else if (isMac && hasCmd("sips")) {
    // sips can't create multi-size ICO; create a single-size as placeholder
    const icoOut = path.join(BUILD, "icon.ico");
    // Rename PNG to ICO as a bare minimum placeholder
    fs.copyFileSync(icoPng, icoOut);
    fs.unlinkSync(icoPng);
    console.log("✓ icon.ico (single-size placeholder — install ImageMagick for multi-size)");
  } else {
    fs.renameSync(icoPng, path.join(BUILD, "icon.ico"));
    console.log("✓ icon.ico (placeholder PNG renamed)");
  }
}

// ─── Build Linux PNGs ────────────────────────────────────────────────────────

async function buildLinuxIcons() {
  const linuxSizes = [16, 32, 48, 64, 128, 256, 512];
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  for (const s of linuxSizes) {
    const dest = path.join(ICONS_DIR, `${s}x${s}.png`);
    console.log(`  linux ${s}x${s} …`);
    await svgToPng(SVG_SRC, dest, s);
  }
  console.log("✓ build/icons/ (Linux)");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  if (!fs.existsSync(SVG_SRC)) {
    console.error("Error: build/icon.svg not found");
    process.exit(1);
  }

  console.log("Generating Wren app icons from build/icon.svg …\n");

  await buildLinuxIcons();
  await buildIco();
  await buildIcns();

  console.log("\nDone. Files written to build/");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
