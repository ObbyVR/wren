import { type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { ClaudeProvider, GeminiProvider, OpenAIProvider, transferContext } from "@wren/ai";
import type { AIProvider } from "@wren/ai";
import type { IpcChannelMap } from "@wren/shared";
import {
  getKey, hasKey, listAliases, removeKey, setKey,
  listAllKeys, setKeyMeta, removeKeyMeta, touchKeyUsage,
  type ProviderId,
} from "./key-store";
import { buildAgenticSystemPrompt, executeAgenticLoop } from "./agentic-engine";
import { sendViaCli } from "./cli-subscription-provider";
import type { AiMessage } from "@wren/shared";

// ── Wren system prompt (injected for ALL providers) ──────────────────────────
const WREN_SYSTEM_PROMPT = "You are inside Wren IDE. NEVER open a browser. When showing anything visual, write an HTML file and include the URL or file path in your response — Wren auto-opens it in the Preview panel. For servers, include http://localhost:PORT. Keep responses concise.";

/**
 * Window conversation history to limit token usage.
 * Keeps last MAX_PAIRS user-assistant pairs. Older messages are
 * compressed into a single summary. Works for all providers.
 */
const MAX_PAIRS = 6; // 12 messages max

function windowHistory(messages: AiMessage[]): AiMessage[] {
  if (messages.length <= MAX_PAIRS * 2) return messages;

  // Split into old and recent
  const cutoff = messages.length - MAX_PAIRS * 2;
  const old = messages.slice(0, cutoff);
  const recent = messages.slice(cutoff);

  // Build a brief summary of old messages (no LLM call — just concatenation)
  const summaryParts: string[] = [];
  for (const m of old) {
    const snippet = m.content.slice(0, 80).replace(/\n/g, " ");
    summaryParts.push(`${m.role === "user" ? "User" : "AI"}: ${snippet}`);
  }
  const summary: AiMessage = {
    role: "user",
    content: `[Prior conversation summary (${old.length} messages):\n${summaryParts.join("\n")}\n]`,
  };

  return [summary, ...recent];
}

// Typed handle helper (mirrors pattern in index.ts)
type TypedHandle = <C extends keyof IpcChannelMap>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    payload: IpcChannelMap[C]["request"]
  ) => Promise<IpcChannelMap[C]["response"]> | IpcChannelMap[C]["response"]
) => void;

const PROVIDER_NAMES: Record<ProviderId, string> = {
  claude: "Anthropic Claude",
  openai: "OpenAI",
  gemini: "Google Gemini",
};

function buildProvider(providerId: ProviderId, key: string): AIProvider {
  switch (providerId) {
    case "openai":
      return new OpenAIProvider(key);
    case "gemini":
      return new GeminiProvider(key);
    case "claude":
    default:
      return new ClaudeProvider(key);
  }
}

// In-memory project config store (persisted separately in production)
const projectConfigs = new Map<string, { providerId: string; accountAlias: string; model: string }>();

export function registerAiHandlers(
  handle: TypedHandle,
  getWindow: () => BrowserWindow | null
): void {
  // ── Legacy key management (Claude only, default alias — backwards compat) ────

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

  // ── Multi-provider management ────────────────────────────────────────────────

  handle("ai:list-providers", async () => {
    const providerIds: ProviderId[] = ["claude", "openai", "gemini"];
    const result = [];
    for (const pid of providerIds) {
      const aliases = listAliases(pid);
      let models: import("@wren/shared").AiModel[] = [];
      if (aliases.length > 0) {
        const key = getKey(pid, aliases[0]);
        if (key) {
          try {
            models = await buildProvider(pid, key).listModels();
          } catch {
            // ignore — provider is configured but unreachable
          }
        }
      }
      result.push({ id: pid, name: PROVIDER_NAMES[pid], aliases, models });
    }
    return result;
  });

  handle("ai:set-provider", async (_event, { providerId, key, alias }) => {
    const pid = providerId as ProviderId;
    const provider = buildProvider(pid, key);
    let valid: boolean;
    try {
      valid = await provider.validateKey(key);
    } catch {
      return { valid: false, error: "Network error while validating key" };
    }
    if (valid) {
      setKey(pid, key, alias ?? "default");
      return { valid: true };
    }
    return { valid: false, error: "Invalid API key (authentication failed)" };
  });

  handle("ai:validate-key", async (_event, { providerId, key }) => {
    const pid = providerId as ProviderId;
    const provider = buildProvider(pid, key);
    let valid: boolean;
    try {
      valid = await provider.validateKey(key);
    } catch {
      return { valid: false, error: "Network error while validating key" };
    }
    return valid ? { valid: true } : { valid: false, error: "Invalid API key" };
  });

  handle("ai:remove-provider-key", (_event, { providerId, alias }) => {
    removeKey(providerId as ProviderId, alias ?? "default");
  });

  // ── Context Bridge ────────────────────────────────────────────────────────────

  handle("ai:transfer-context", (_event, { messages, fromProviderId, toProviderId }) => {
    return transferContext(messages, fromProviderId, toProviderId);
  });

  // ── Project config ────────────────────────────────────────────────────────────

  handle("project:get-config", (_event, { projectId }) => {
    return projectConfigs.get(projectId) ?? null;
  });

  handle("project:set-config", (_event, { projectId, config }) => {
    projectConfigs.set(projectId, config);
  });

  // ── Credential Vault ──────────────────────────────────────────────────────────

  handle("credentials:list", () => listAllKeys());

  handle("credentials:set", async (_event, { providerId, alias, key, label }) => {
    const pid = providerId as ProviderId;
    const provider = buildProvider(pid, key);
    let valid: boolean;
    try {
      valid = await provider.validateKey(key);
    } catch {
      return { valid: false, error: "Network error while validating key" };
    }
    if (valid) {
      setKey(pid, key, alias);
      setKeyMeta(pid, alias, label);
      return { valid: true };
    }
    return { valid: false, error: "Invalid API key (authentication failed)" };
  });

  handle("credentials:remove", (_event, { providerId, alias }) => {
    removeKey(providerId as ProviderId, alias);
    removeKeyMeta(providerId as ProviderId, alias);
  });

  handle("credentials:set-meta", (_event, { providerId, alias, label }) => {
    setKeyMeta(providerId as ProviderId, alias, label);
  });

  // ── Chat / streaming ─────────────────────────────────────────────────────────

  handle("ai:send-message", async (_event, payload) => {
    const { requestId, messages, model, systemPrompt, agenticMode, projectRoot, openFiles } = payload;
    const providerId = (payload.providerId ?? "claude") as ProviderId;
    const accountAlias = payload.accountAlias ?? "default";
    const sessionMode = payload.sessionMode ?? "api";
    const chatSessionId = payload.chatSessionId ?? "";
    const win = getWindow();

    // ── Subscription mode: route through local CLI ────────────────────────────
    if (sessionMode === "subscription") {
      // Build prompt from last user message (CLI takes a single prompt, not history)
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const prompt = lastUserMsg?.content ?? "";
      if (!prompt) {
        win?.webContents.send("ai:stream-error", { requestId, error: "Empty prompt" });
        return;
      }

      sendViaCli(requestId, prompt, {
        providerId,
        model,
        cwd: projectRoot ?? process.env.HOME ?? "",
        chatSessionId,
      }, win);
      return;
    }

    // ── API mode: use SDK with API key ────────────────────────────────────────

    // Track key usage
    touchKeyUsage(providerId, accountAlias);

    const key = getKey(providerId, accountAlias);
    if (!key) {
      win?.webContents.send("ai:stream-error", {
        requestId,
        error: `No API key configured for provider "${providerId}" (alias: ${accountAlias}). Please add your key in settings.`,
      });
      return;
    }

    const provider = buildProvider(providerId, key);

    // Stream in background — don't await so the renderer gets the response
    // immediately and can start listening for chunks.
    void (async () => {
      try {
        // Apply Wren system prompt (all providers) + history windowing
        let resolvedSystemPrompt = systemPrompt ?? WREN_SYSTEM_PROMPT;
        const windowedMessages = windowHistory(messages);

        if (agenticMode && projectRoot) {
          resolvedSystemPrompt = await buildAgenticSystemPrompt(
            projectRoot,
            openFiles ?? []
          );
          const usage = await executeAgenticLoop(
            requestId,
            windowedMessages,
            provider,
            { model, systemPrompt: resolvedSystemPrompt, maxTokens: 4096 },
            projectRoot,
            win
          );
          win?.webContents.send("ai:stream-done", {
            requestId,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          });
        } else {
          const usage = await provider.sendMessage(
            windowedMessages,
            { model, systemPrompt: resolvedSystemPrompt, maxTokens: 4096 },
            (chunk) => {
              if (chunk.type === "text") {
                win?.webContents.send("ai:stream-chunk", { requestId, text: chunk.text });
              }
            }
          );
          win?.webContents.send("ai:stream-done", {
            requestId,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error during streaming";
        win?.webContents.send("ai:stream-error", { requestId, error: message });
      }
    })();
  });
}
