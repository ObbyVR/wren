import type { AiMessage, AiModel } from "@wren/shared";
import type { AIProvider, ChatOptions, ProviderChunk, UsageStats } from "./types";

/**
 * Ollama provider (local inference).
 *
 * Talks to a locally running Ollama server (default: http://localhost:11434).
 * The "apiKey" slot is overloaded to carry the base URL so the provider stays
 * BYOK-uniform — set key to `http://your-host:11434` or leave default.
 *
 * No auth, no cloud round-trip, no cost. Tool-use is emulated via the structured
 * output channel when the chosen model supports it (Llama 3 Tool-Use, Qwen2.5
 * tool support). For plain chat this just streams text.
 */

const DEFAULT_BASE_URL = "http://localhost:11434";

const OLLAMA_MODELS: AiModel[] = [
  { id: "llama3", name: "Llama 3", providerId: "ollama" },
  { id: "llama3.2", name: "Llama 3.2", providerId: "ollama" },
  { id: "qwen2.5-coder", name: "Qwen 2.5 Coder", providerId: "ollama" },
  { id: "deepseek-coder-v2", name: "DeepSeek Coder v2", providerId: "ollama" },
  { id: "codellama", name: "Code Llama", providerId: "ollama" },
];

interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaStreamChunk {
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements AIProvider {
  readonly id = "ollama";
  readonly name = "Ollama";

  private baseUrl: string;

  constructor(apiKeyOrBaseUrl?: string) {
    // Accept either a URL or the sentinel "default" / empty → use default
    const candidate = (apiKeyOrBaseUrl ?? "").trim();
    this.baseUrl = candidate.startsWith("http") ? candidate.replace(/\/$/, "") : DEFAULT_BASE_URL;
  }

  async sendMessage(
    messages: AiMessage[],
    options: ChatOptions,
    onChunk: (chunk: ProviderChunk) => void
  ): Promise<UsageStats> {
    const ollamaMessages: OllamaChatMessage[] = [];
    if (options.systemPrompt) {
      ollamaMessages.push({ role: "system", content: options.systemPrompt });
    }
    for (const m of messages) {
      ollamaMessages.push({ role: m.role, content: m.content });
    }

    const body = {
      model: options.model,
      messages: ollamaMessages,
      stream: true,
      options: {
        num_predict: options.maxTokens ?? 4096,
      },
    };

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Ollama error ${resp.status}: ${text || resp.statusText}`);
    }
    if (!resp.body) throw new Error("Ollama response has no body");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let inputTokens = 0;
    let outputTokens = 0;

    // Ollama streams newline-delimited JSON
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;
        let chunk: OllamaStreamChunk;
        try {
          chunk = JSON.parse(line) as OllamaStreamChunk;
        } catch {
          continue;
        }
        const text = chunk.message?.content;
        if (text) onChunk({ type: "text", text });
        if (chunk.done) {
          if (typeof chunk.prompt_eval_count === "number") inputTokens = chunk.prompt_eval_count;
          if (typeof chunk.eval_count === "number") outputTokens = chunk.eval_count;
        }
      }
    }

    return { inputTokens, outputTokens };
  }

  async listModels(): Promise<AiModel[]> {
    // Try to fetch installed models from the running server; fall back to curated list
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`);
      if (!resp.ok) return OLLAMA_MODELS;
      const data = (await resp.json()) as { models?: Array<{ name: string }> };
      if (!data.models?.length) return OLLAMA_MODELS;
      return data.models.map((m) => ({
        id: m.name,
        name: m.name,
        providerId: "ollama",
      }));
    } catch {
      return OLLAMA_MODELS;
    }
  }

  async validateKey(_key: string): Promise<boolean> {
    // There's no auth — we just ping the server to confirm reachability
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
