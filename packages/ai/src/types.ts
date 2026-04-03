import type { AiMessage, AiModel } from "@wren/shared";

export interface StreamChunk {
  type: "text";
  text: string;
}

export interface ChatOptions {
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
}

export interface AIProvider {
  id: string;
  name: string;
  sendMessage(
    messages: AiMessage[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<UsageStats>;
  listModels(): Promise<AiModel[]>;
  validateKey(key: string): Promise<boolean>;
}
