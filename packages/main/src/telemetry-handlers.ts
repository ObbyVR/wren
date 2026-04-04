/**
 * Telemetry IPC handlers — placeholder.
 *
 * Telemetry is GDPR-compliant: opt-in only (default OFF).
 * No events are sent to any server in this implementation.
 * The opt-in preference is persisted to a local JSON file.
 */

import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import type { TelemetrySettings } from "@wren/shared";
import type { IpcChannelMap } from "@wren/shared";
import type { IpcMainInvokeEvent } from "electron";

type HandleFn = <C extends keyof IpcChannelMap>(
  channel: C,
  handler: (event: IpcMainInvokeEvent, payload: IpcChannelMap[C]["request"]) =>
    Promise<IpcChannelMap[C]["response"]> | IpcChannelMap[C]["response"],
) => void;

const TELEMETRY_FILE = path.join(app.getPath("userData"), "telemetry.json");

async function readSettings(): Promise<TelemetrySettings> {
  try {
    const raw = await fs.readFile(TELEMETRY_FILE, "utf8");
    return JSON.parse(raw) as TelemetrySettings;
  } catch {
    return { optedIn: false };
  }
}

async function writeSettings(s: TelemetrySettings): Promise<void> {
  await fs.writeFile(TELEMETRY_FILE, JSON.stringify(s), "utf8");
}

/** No-op telemetry sink — replace with real HTTP call once backend exists. */
export function trackEvent(
  _name: string,
  _props?: Record<string, unknown>,
): void {
  // Intentionally empty: no data leaves the machine until a real endpoint is wired.
}

export function registerTelemetryHandlers(handle: HandleFn): void {
  handle("telemetry:get-settings", async (): Promise<TelemetrySettings> => {
    return readSettings();
  });

  handle("telemetry:set-opted-in", async (_event, { optedIn }): Promise<void> => {
    await writeSettings({ optedIn });
    // Fire app_launched event on opt-in (once)
    if (optedIn) {
      trackEvent("app_launched");
    }
  });
}
