import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";
import { auditLog } from "./audit-log";

export type ProviderId = "claude" | "openai" | "gemini" | "mistral";

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
  auditLog({ event: "key.set", provider, alias });
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
  auditLog({ event: "key.remove", provider, alias });
}

export function hasKey(provider: ProviderId, alias = "default"): boolean {
  const keys = readKeysFile();
  return !!keys[provider]?.[alias];
}

export function listAliases(provider: ProviderId): string[] {
  const keys = readKeysFile();
  return Object.keys(keys[provider] ?? {});
}

// ── Key metadata ──────────────────────────────────────────────────────────────

export interface KeyMeta {
  providerId: ProviderId;
  alias: string;
  label?: string | undefined;
  createdAt: number;
  lastUsedAt?: number | undefined;
}

const META_FILE = path.join(app.getPath("userData"), "wren-keys-meta.json");

type MetaFile = KeyMeta[];

function readMetaFile(): MetaFile {
  try {
    const raw = fs.readFileSync(META_FILE, "utf-8");
    return JSON.parse(raw) as MetaFile;
  } catch {
    return [];
  }
}

function writeMetaFile(data: MetaFile): void {
  fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function getKeyMeta(providerId: ProviderId, alias = "default"): KeyMeta | undefined {
  return readMetaFile().find(
    (m) => m.providerId === providerId && m.alias === alias,
  );
}

export function setKeyMeta(providerId: ProviderId, alias: string, label?: string): void {
  const metas = readMetaFile();
  const idx = metas.findIndex(
    (m) => m.providerId === providerId && m.alias === alias,
  );
  if (idx >= 0) {
    if (label !== undefined) metas[idx].label = label;
  } else {
    metas.push({ providerId, alias, label, createdAt: Date.now() });
  }
  writeMetaFile(metas);
}

export function removeKeyMeta(providerId: ProviderId, alias: string): void {
  const metas = readMetaFile().filter(
    (m) => !(m.providerId === providerId && m.alias === alias),
  );
  writeMetaFile(metas);
}

export function touchKeyUsage(providerId: ProviderId, alias = "default"): void {
  const metas = readMetaFile();
  const entry = metas.find(
    (m) => m.providerId === providerId && m.alias === alias,
  );
  if (entry) {
    entry.lastUsedAt = Date.now();
    writeMetaFile(metas);
  }
}

export function listAllKeys(): import("@wren/shared").CredentialEntry[] {
  const keys = readKeysFile();
  const metas = readMetaFile();
  const result: import("@wren/shared").CredentialEntry[] = [];

  for (const [pid, aliases] of Object.entries(keys)) {
    const providerId = pid as ProviderId;
    for (const alias of Object.keys(aliases ?? {})) {
      const plain = getKey(providerId, alias);
      const masked = plain
        ? "••••••" + plain.slice(-6)
        : "••••••";
      const meta = metas.find(
        (m) => m.providerId === providerId && m.alias === alias,
      );
      const entry: import("@wren/shared").CredentialEntry = {
        providerId,
        alias,
        keyMasked: masked,
        createdAt: meta?.createdAt ?? 0,
      };
      if (meta?.label) entry.label = meta.label;
      if (meta?.lastUsedAt) entry.lastUsedAt = meta.lastUsedAt;
      result.push(entry);
    }
  }
  return result;
}
