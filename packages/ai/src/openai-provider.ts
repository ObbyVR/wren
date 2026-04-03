import OpenAI from "openai";
import type { AiMessage, AiModel } from "@wren/shared";
import type { AIProvider, ChatOptions, ProviderChunk, UsageStats } from "./types";
import { toOpenAiTools } from "./tools";

const OPENAI_MODELS: AiModel[] = [
  { id: "gpt-4o", name: "GPT-4o", providerId: "openai" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", providerId: "openai" },
  { id: "o1-mini", name: "o1 Mini", providerId: "openai" },
];

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly name = "OpenAI";

  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async sendMessage(
    messages: AiMessage[],
    options: ChatOptions,
    onChunk: (chunk: ProviderChunk) => void
  ): Promise<UsageStats> {
    const isO1 = options.model.startsWith("o1");
    const systemMessages: OpenAI.ChatCompletionMessageParam[] =
      options.systemPrompt && !isO1
        ? [{ role: "system", content: options.systemPrompt }]
        : [];

    const chatMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(
      (m) => ({ role: m.role, content: m.content })
    );

    // o1 models do not support function_calling
    const openAiTools =
      options.tools?.length && !isO1 ? toOpenAiTools(options.tools) : undefined;

    // Buffer for accumulating function call arguments per tool_call index
    const toolCallBuffers = new Map<
      number,
      { id: string; name: string; argsJson: string }
    >();

    const stream = await this.client.chat.completions.create({
      model: options.model,
      messages: [...systemMessages, ...chatMessages],
      ...(isO1 ? {} : { max_tokens: options.maxTokens ?? 4096 }),
      ...(openAiTools ? { tools: openAiTools } : {}),
      stream: true,
      stream_options: { include_usage: true },
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        onChunk({ type: "text", text: delta.content });
      }

      // Accumulate streaming function call deltas
      if (delta?.tool_calls) {
        for (const tcDelta of delta.tool_calls) {
          const idx = tcDelta.index;
          if (!toolCallBuffers.has(idx)) {
            toolCallBuffers.set(idx, {
              id: tcDelta.id ?? "",
              name: tcDelta.function?.name ?? "",
              argsJson: "",
            });
          }
          const buf = toolCallBuffers.get(idx)!;
          if (tcDelta.id) buf.id = tcDelta.id;
          if (tcDelta.function?.name) buf.name = tcDelta.function.name;
          if (tcDelta.function?.arguments) buf.argsJson += tcDelta.function.arguments;
        }
      }

      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }

      // When the choice finishes, emit any accumulated tool calls
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason === "tool_calls" || finishReason === "stop") {
        for (const [, buf] of toolCallBuffers) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(buf.argsJson) as Record<string, unknown>;
          } catch {
            // malformed JSON — use empty
          }
          onChunk({
            type: "tool_call",
            toolCall: { id: buf.id, name: buf.name, input },
          });
        }
        toolCallBuffers.clear();
      }
    }

    return { inputTokens, outputTokens };
  }

  async listModels(): Promise<AiModel[]> {
    return OPENAI_MODELS;
  }

  async validateKey(key: string): Promise<boolean> {
    try {
      const testClient = new OpenAI({ apiKey: key });
      await testClient.models.list();
      return true;
    } catch (err) {
      const error = err as { status?: number };
      if (error.status === 401) return false;
      if (error.status === 429) return true;
      throw err;
    }
  }
}
