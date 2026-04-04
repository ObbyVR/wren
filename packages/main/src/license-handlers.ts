/**
 * License IPC handlers.
 *
 * License key is persisted via Electron safeStorage so it stays encrypted
 * at rest.  Validation is fully offline (format + expiry check).
 */

import { safeStorage, app } from "electron";
import path from "path";
import fs from "fs/promises";
import { validateLicenseKey, getLimits } from "@wren/license";
import type { LicenseStatus, TierLimits } from "@wren/shared";
import type { IpcChannelMap } from "@wren/shared";
import type { IpcMainInvokeEvent } from "electron";

type HandleFn = <C extends keyof IpcChannelMap>(
  channel: C,
  handler: (event: IpcMainInvokeEvent, payload: IpcChannelMap[C]["request"]) =>
    Promise<IpcChannelMap[C]["response"]> | IpcChannelMap[C]["response"],
) => void;

const LICENSE_FILE = path.join(app.getPath("userData"), "license.enc");

async function readStoredKey(): Promise<string | null> {
  try {
    const buf = await fs.readFile(LICENSE_FILE);
    if (!safeStorage.isEncryptionAvailable()) {
      return buf.toString("utf8");
    }
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

async function writeStoredKey(key: string): Promise<void> {
  if (safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString(key);
    await fs.writeFile(LICENSE_FILE, enc);
  } else {
    await fs.writeFile(LICENSE_FILE, key, "utf8");
  }
}

async function deleteStoredKey(): Promise<void> {
  try {
    await fs.unlink(LICENSE_FILE);
  } catch { /* already gone */ }
}

export function registerLicenseHandlers(handle: HandleFn): void {
  handle("license:get-status", async (): Promise<LicenseStatus> => {
    const key = await readStoredKey();
    return validateLicenseKey(key);
  });

  handle("license:activate", async (_event, { key }): Promise<LicenseStatus> => {
    const status = validateLicenseKey(key);
    if (status.valid) {
      await writeStoredKey(key);
    }
    return status;
  });

  handle("license:deactivate", async (): Promise<void> => {
    await deleteStoredKey();
  });

  handle("license:get-limits", async (): Promise<TierLimits> => {
    const key = await readStoredKey();
    const status = validateLicenseKey(key);
    return getLimits(status.tier);
  });
}
