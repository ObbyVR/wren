import { type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { ClaudeProvider } from "@wren/ai";
import type { IpcChannelMap } from "@wren/shared";
import { getKey, hasKey, removeKey, setKey } from "./key-store";

// Typed handle helper (mirrors pattern in index.ts)
type TypedHandle = <C extends keyof IpcChannelMap>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    payload: IpcChannelMap[C]["request"]
  ) => Promise<IpcChannelMap[C]["response"]> | IpcChannelMap[C]["response"]
) => void;

export function registerAiHandlers(
  handle: TypedHandle,
  getWindow: () => BrowserWindow | null
): void {
  // ── Key management ──────────────────────────────────────────────────────────

  handle("ai:get-key-status", () => ({ hasKey: hasKey("claude") }));

  handle("ai:set-key", async (_event, { key }) => {
    const provider = new ClaudeProvider(key);
    let valid: boolean;
    try {
      valid = await provider.validateKey(key);
    } catch {
      return { valid: false, error: "Network error while validating key" };
    }
    if (valid) {
      setKey("claude", key);
      return { valid: true };
    }
    return { valid: false, error: "Invalid API key (authentication failed)" };
  });

  handle("ai:remove-key", () => {
    removeKey("claude");
  });

  // ── Models ──────────────────────────────────────────────────────────────────

  handle("ai:list-models", async () => {
    const key = getKey("claude");
    if (!key) return [];
    const provider = new ClaudeProvider(key);
    return provider.listModels();
  });

  // ── Chat / streaming ────────────────────────────────────────────────────────

  handle("ai:send-message", async (_event, payload) => {
    const { requestId, messages, model, systemPrompt } = payload;
    const win = getWindow();

    const key = getKey("claude");
    if (!key) {
      win?.webContents.send("ai:stream-error", {
        requestId,
        error: "No API key configured. Please add your Anthropic API key in settings.",
      });
      return;
    }

    const provider = new ClaudeProvider(key);

    // Stream in background — don't await in the IPC handler so the renderer
    // gets the response immediately and can start listening for chunks.
    void (async () => {
      try {
        const usage = await provider.sendMessage(
          messages,
          { model, ...(systemPrompt !== undefined ? { systemPrompt } : {}), maxTokens: 4096 },
          (chunk) => {
            win?.webContents.send("ai:stream-chunk", {
              requestId,
              text: chunk.text,
            });
          }
        );
        win?.webContents.send("ai:stream-done", {
          requestId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error during streaming";
        win?.webContents.send("ai:stream-error", { requestId, error: message });
      }
    })();
  });
}
