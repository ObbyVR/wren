/**
 * Generates simple SVG-based placeholder icons for the Nexus Bridge extension.
 * Run: node generate-icons.mjs
 * Requires: npm install -g sharp (or just use PNG files you already have)
 *
 * For production, replace icons/ with proper branded PNGs.
 */
import { createCanvas } from "canvas";
import { writeFileSync } from "fs";

const sizes = [16, 48, 128];

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.15);
  ctx.fill();

  // "W" letter
  ctx.fillStyle = "#7c6af5";
  ctx.font = `bold ${Math.round(size * 0.6)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("W", size / 2, size / 2);

  writeFileSync(`icons/icon${size}.png`, canvas.toBuffer("image/png"));
  console.log(`Generated icons/icon${size}.png`);
}
