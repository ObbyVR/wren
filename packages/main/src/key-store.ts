import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";

const KEYS_FILE = path.join(app.getPath("userData"), "wren-keys.json");

interface KeysFile {
  claude?: string; // base64-encoded encrypted buffer
}

function readKeysFile(): KeysFile {
  try {
    const raw = fs.readFileSync(KEYS_FILE, "utf-8");
    return JSON.parse(raw) as KeysFile;
  } catch {
    return {};
  }
}

function writeKeysFile(data: KeysFile): void {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data), "utf-8");
}

export function getKey(provider: "claude"): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const keys = readKeysFile();
  const encrypted = keys[provider];
  if (!encrypted) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch {
    return null;
  }
}

export function setKey(provider: "claude", plaintext: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Encryption not available on this system");
  }
  const encrypted = safeStorage.encryptString(plaintext);
  const keys = readKeysFile();
  keys[provider] = encrypted.toString("base64");
  writeKeysFile(keys);
}

export function removeKey(provider: "claude"): void {
  const keys = readKeysFile();
  delete keys[provider];
  writeKeysFile(keys);
}

export function hasKey(provider: "claude"): boolean {
  const keys = readKeysFile();
  return !!keys[provider];
}
