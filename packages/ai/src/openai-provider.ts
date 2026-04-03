import OpenAI from "openai";
import type { AiMessage, AiModel } from "@wren/shared";
import type { AIProvider, ChatOptions, StreamChunk, UsageStats } from "./types";

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
    onChunk: (chunk: StreamChunk) => void
  ): Promise<UsageStats> {
    const isO1 = options.model.startsWith("o1");
    const systemMessages: OpenAI.ChatCompletionMessageParam[] =
      options.systemPrompt && !isO1
        ? [{ role: "system", content: options.systemPrompt }]
        : [];

    const chatMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(
      (m) => ({ role: m.role, content: m.content })
    );

    const stream = await this.client.chat.completions.create({
      model: options.model,
      messages: [...systemMessages, ...chatMessages],
      ...(isO1 ? {} : { max_tokens: options.maxTokens ?? 4096 }),
      stream: true,
      stream_options: { include_usage: true },
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        onChunk({ type: "text", text: delta });
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
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
