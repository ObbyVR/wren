import type { AiMessage, AiModel, AiToolCall, AiToolResult } from "@wren/shared";

export interface StreamChunk {
  type: "text";
  text: string;
}

export interface ToolCallChunk {
  type: "tool_call";
  toolCall: AiToolCall;
}

export type ProviderChunk = StreamChunk | ToolCallChunk;

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for input parameters */
  inputSchema: Record<string, unknown>;
}

export interface ChatOptions {
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
  tools?: ToolDefinition[];
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Message with optional tool calls — used in the agentic loop to build
 * multi-turn conversations that include tool results.
 */
export interface AiMessageWithTools {
  role: "user" | "assistant";
  content: string;
  toolCalls?: AiToolCall[];
  toolResults?: AiToolResult[];
}

export interface AIProvider {
  id: string;
  name: string;
  sendMessage(
    messages: AiMessage[],
    options: ChatOptions,
    onChunk: (chunk: ProviderChunk) => void
  ): Promise<UsageStats>;
  listModels(): Promise<AiModel[]>;
  validateKey(key: string): Promise<boolean>;
}
