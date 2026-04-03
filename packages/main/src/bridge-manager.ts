/**
 * BridgeManager — Electron main-process side of the Nexus Bridge.
 *
 * Starts a local WebSocket server that the native messaging host connects to.
 * Receives events from the Chrome extension (via native host) and forwards
 * them to the renderer via IPC. Also accepts commands from the renderer and
 * sends them to the extension.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { BrowserWindow } from "electron";
import type {
  BridgeOpenPreviewPayload,
  BridgeResizePayload,
  BridgeWindowInfo,
  BridgeStatus,
  BridgeNetworkEvent,
} from "@wren/shared";

const DEFAULT_PORT = 7345;

export interface BridgeManagerOptions {
  port?: number;
  getWindow: () => BrowserWindow | null;
}

export class BridgeManager {
  private wss: WebSocketServer | null = null;
  private extensionSocket: WebSocket | null = null;
  private port: number;
  private getWindow: () => BrowserWindow | null;

  /** Track open preview windows: wrenWindowId → url */
  private openWindows = new Map<string, string>();

  constructor(options: BridgeManagerOptions) {
    this.port = options.port ?? DEFAULT_PORT;
    this.getWindow = options.getWindow;
  }

  start(): void {
    this.wss = new WebSocketServer({ host: "127.0.0.1", port: this.port });

    this.wss.on("listening", () => {
      console.log(`[BridgeManager] WebSocket server listening on ws://127.0.0.1:${this.port}`);
    });

    this.wss.on("connection", (socket) => {
      console.log("[BridgeManager] Native host connected");
      this.extensionSocket = socket;
      this.notifyRendererStatus();

      socket.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString("utf8"));
          this.handleExtensionEvent(msg);
        } catch (e) {
          console.error("[BridgeManager] Failed to parse message from extension:", e);
        }
      });

      socket.on("close", () => {
        console.log("[BridgeManager] Native host disconnected");
        if (this.extensionSocket === socket) {
          this.extensionSocket = null;
        }
        this.notifyRendererStatus();
      });

      socket.on("error", (err) => {
        console.error("[BridgeManager] Socket error:", err.message);
      });
    });

    this.wss.on("error", (err) => {
      console.error("[BridgeManager] Server error:", err.message);
    });
  }

  stop(): void {
    this.wss?.close();
    this.wss = null;
    this.extensionSocket = null;
  }

  // ── Commands (renderer → extension) ─────────────────────────────────────────

  openPreview(payload: BridgeOpenPreviewPayload): { wrenWindowId: string } {
    const { wrenWindowId, url } = payload;
    this.openWindows.set(wrenWindowId, url);
    this.sendToExtension({ type: "open-preview", ...payload });
    return { wrenWindowId };
  }

  closePreview(wrenWindowId: string): void {
    this.openWindows.delete(wrenWindowId);
    this.sendToExtension({ type: "close-preview", wrenWindowId });
  }

  resizePreview(payload: BridgeResizePayload): void {
    this.sendToExtension({ type: "resize-preview", ...payload });
  }

  navigatePreview(wrenWindowId: string, url: string): void {
    this.openWindows.set(wrenWindowId, url);
    this.sendToExtension({ type: "navigate-preview", wrenWindowId, url });
  }

  getStatus(): BridgeStatus {
    return {
      connected: this.extensionSocket !== null,
      windowCount: this.openWindows.size,
    };
  }

  listWindows(): BridgeWindowInfo[] {
    return Array.from(this.openWindows.entries()).map(([wrenWindowId, url]) => ({
      wrenWindowId,
      url,
      status: "open" as const,
    }));
  }

  // ── Events (extension → renderer) ────────────────────────────────────────────

  private handleExtensionEvent(msg: Record<string, unknown>): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;

    switch (msg.type) {
      case "preview-opened":
        win.webContents.send("bridge:preview-opened", {
          wrenWindowId: msg.wrenWindowId,
          chromeWindowId: msg.chromeWindowId,
        });
        break;

      case "preview-closed":
        this.openWindows.delete(msg.wrenWindowId as string);
        win.webContents.send("bridge:preview-closed", {
          wrenWindowId: msg.wrenWindowId,
          reason: msg.reason ?? "extension",
        });
        this.notifyRendererStatus();
        break;

      case "preview-error":
        win.webContents.send("bridge:preview-error", {
          wrenWindowId: msg.wrenWindowId,
          error: msg.error,
        });
        break;

      case "network-event":
        win.webContents.send("bridge:network-event", {
          wrenWindowId: msg.wrenWindowId,
          event: msg.event as BridgeNetworkEvent,
        });
        break;

      case "pong":
        // heartbeat ack — no-op
        break;

      default:
        console.warn("[BridgeManager] Unknown event from extension:", msg.type);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private sendToExtension(msg: Record<string, unknown>): void {
    if (!this.extensionSocket || this.extensionSocket.readyState !== WebSocket.OPEN) {
      console.warn("[BridgeManager] Extension not connected; dropping message:", msg.type);
      return;
    }
    this.extensionSocket.send(JSON.stringify(msg));
  }

  private notifyRendererStatus(): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send("bridge:status-changed", this.getStatus());
  }
}
