import Anthropic from "@anthropic-ai/sdk";
import type { AiMessage, AiModel } from "@wren/shared";
import type { AIProvider, ChatOptions, StreamChunk, UsageStats } from "./types";

const CLAUDE_MODELS: AiModel[] = [
  { id: "claude-sonnet-4-5-20250514", name: "Claude Sonnet 4.5", providerId: "claude" },
  { id: "claude-opus-4-0-20250115", name: "Claude Opus 4.0", providerId: "claude" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", providerId: "claude" },
];

export class ClaudeProvider implements AIProvider {
  readonly id = "claude";
  readonly name = "Anthropic Claude";

  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async sendMessage(
    messages: AiMessage[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<UsageStats> {
    const stream = this.client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        onChunk({ type: "text", text: event.delta.text });
      }
    }

    const finalMessage = await stream.finalMessage();
    return {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    };
  }

  async listModels(): Promise<AiModel[]> {
    return CLAUDE_MODELS;
  }

  async validateKey(key: string): Promise<boolean> {
    try {
      const testClient = new Anthropic({ apiKey: key });
      await testClient.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
      return true;
    } catch (err) {
      const error = err as { status?: number };
      // 401 = invalid key, anything else = network/server issue but key might still be valid
      if (error.status === 401) return false;
      // Rate limit or other error — treat key as valid
      if (error.status === 429) return true;
      throw err;
    }
  }
}
