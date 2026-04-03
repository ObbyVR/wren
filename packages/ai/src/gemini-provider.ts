import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiMessage, AiModel } from "@wren/shared";
import type { AIProvider, ChatOptions, StreamChunk, UsageStats } from "./types";

const GEMINI_MODELS: AiModel[] = [
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", providerId: "gemini" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", providerId: "gemini" },
];

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly name = "Google Gemini";

  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async sendMessage(
    messages: AiMessage[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<UsageStats> {
    const model = this.client.getGenerativeModel({
      model: options.model,
      ...(options.systemPrompt ? { systemInstruction: options.systemPrompt } : {}),
    });

    // Gemini uses history + last user message pattern
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const lastMessage = messages[messages.length - 1];

    const chat = model.startChat({
      history,
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    });

    const result = await chat.sendMessageStream(lastMessage?.content ?? "");

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        onChunk({ type: "text", text });
      }
    }

    const response = await result.response;
    if (response.usageMetadata) {
      inputTokens = response.usageMetadata.promptTokenCount ?? 0;
      outputTokens = response.usageMetadata.candidatesTokenCount ?? 0;
    }

    return { inputTokens, outputTokens };
  }

  async listModels(): Promise<AiModel[]> {
    return GEMINI_MODELS;
  }

  async validateKey(key: string): Promise<boolean> {
    try {
      const testClient = new GoogleGenerativeAI(key);
      const model = testClient.getGenerativeModel({ model: "gemini-2.0-flash" });
      await model.generateContent("hi");
      return true;
    } catch (err) {
      const error = err as { status?: number; message?: string };
      if (
        error.status === 400 ||
        error.message?.includes("API key not valid") ||
        error.message?.includes("INVALID_ARGUMENT")
      ) {
        return false;
      }
      if (error.status === 429) return true;
      throw err;
    }
  }
}
