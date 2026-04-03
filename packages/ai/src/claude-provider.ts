import Anthropic from "@anthropic-ai/sdk";
import type { AiMessage, AiModel } from "@wren/shared";
import type { AIProvider, ChatOptions, ProviderChunk, UsageStats } from "./types";
import { toAnthropicTools } from "./tools";

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
    onChunk: (chunk: ProviderChunk) => void
  ): Promise<UsageStats> {
    // Cast required: toAnthropicTools returns plain objects; SDK expects InputSchema
    // with a required `type` field. The JSON schema objects are compatible at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anthropicTools = options.tools?.length
      ? (toAnthropicTools(options.tools) as any)
      : undefined;

    // Buffer for accumulating tool_use blocks across stream events
    const toolUseBlocks = new Map<number, { id: string; name: string; inputJson: string }>();

    const stream = this.client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
      ...(anthropicTools ? { tools: anthropicTools } : {}),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          toolUseBlocks.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: "",
          });
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          onChunk({ type: "text", text: event.delta.text });
        } else if (event.delta.type === "input_json_delta") {
          const block = toolUseBlocks.get(event.index);
          if (block) {
            block.inputJson += event.delta.partial_json;
          }
        }
      } else if (event.type === "content_block_stop") {
        const block = toolUseBlocks.get(event.index);
        if (block) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(block.inputJson) as Record<string, unknown>;
          } catch {
            // malformed JSON — pass empty input
          }
          onChunk({
            type: "tool_call",
            toolCall: { id: block.id, name: block.name, input },
          });
          toolUseBlocks.delete(event.index);
        }
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
      if (error.status === 401) return false;
      if (error.status === 429) return true;
      throw err;
    }
  }
}
