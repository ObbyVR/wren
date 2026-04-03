import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";

export type ProviderId = "claude" | "openai" | "gemini";

const KEYS_FILE = path.join(app.getPath("userData"), "wren-keys.json");

// Keys are stored as: { providerId: { alias: encryptedBase64 } }
// The "default" alias is used when no alias is specified.
type KeysFile = Partial<Record<ProviderId, Record<string, string>>>;

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

export function getKey(provider: ProviderId, alias = "default"): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const keys = readKeysFile();
  const encrypted = keys[provider]?.[alias];
  if (!encrypted) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch {
    return null;
  }
}

export function setKey(provider: ProviderId, plaintext: string, alias = "default"): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Encryption not available on this system");
  }
  const encrypted = safeStorage.encryptString(plaintext);
  const keys = readKeysFile();
  if (!keys[provider]) keys[provider] = {};
  keys[provider]![alias] = encrypted.toString("base64");
  writeKeysFile(keys);
}

export function removeKey(provider: ProviderId, alias = "default"): void {
  const keys = readKeysFile();
  if (keys[provider]) {
    delete keys[provider]![alias];
    if (Object.keys(keys[provider]!).length === 0) {
      delete keys[provider];
    }
  }
  writeKeysFile(keys);
}

export function hasKey(provider: ProviderId, alias = "default"): boolean {
  const keys = readKeysFile();
  return !!keys[provider]?.[alias];
}

export function listAliases(provider: ProviderId): string[] {
  const keys = readKeysFile();
  return Object.keys(keys[provider] ?? {});
}
