import type { AiMessage } from "@wren/shared";

/**
 * Neutral message format for cross-provider context transfer.
 * This is a simple array of { role, content } tuples — provider-agnostic.
 */
export type NeutralHistory = AiMessage[];

/**
 * Providers that support tool use. Messages containing tool call markers
 * are stripped when transferring to a provider not in this set.
 */
const TOOL_CAPABLE_PROVIDERS = new Set(["claude", "anthropic", "openai"]);

/**
 * Heuristic: detect if a message body contains tool-call/result markers.
 * These are produced by the agentic engine and are not meaningful to providers
 * that don't support function calling.
 */
function hasToolContent(content: string): boolean {
  return (
    content.includes("<tool_use>") ||
    content.includes("<tool_result>") ||
    content.includes("[TOOL:")
  );
}

/**
 * Remove messages that carry tool-call or tool-result payloads.
 * Used when the destination provider does not support function calling.
 */
export function stripToolContent(messages: AiMessage[]): AiMessage[] {
  return messages.filter((m) => !hasToolContent(m.content));
}

/**
 * Serialize a conversation history into a neutral format that can be
 * transferred across providers.
 */
export function serializeHistory(messages: AiMessage[]): NeutralHistory {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Deserialize a neutral history back into provider-ready messages.
 * Different providers may expect slightly different shapes; this function
 * returns the canonical AiMessage[] that all providers accept.
 */
export function deserializeHistory(neutral: NeutralHistory): AiMessage[] {
  return neutral.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Transfer context from one provider to another mid-conversation.
 *
 * When the destination provider does not support tool use (and the source
 * did), any messages containing tool call/result payloads are stripped so
 * that the conversation remains valid for the new provider.
 *
 * Returns the portable message list, a human-readable summary for a preview
 * dialog, and the number of messages stripped due to tool incompatibility.
 */
export function transferContext(
  history: AiMessage[],
  fromProviderId: string,
  toProviderId: string
): { messages: AiMessage[]; summary: string[]; strippedCount: number } {
  const neutral = serializeHistory(history);

  const fromHasTools = TOOL_CAPABLE_PROVIDERS.has(fromProviderId);
  const toHasTools = TOOL_CAPABLE_PROVIDERS.has(toProviderId);

  let messages = deserializeHistory(neutral);
  let strippedCount = 0;

  if (fromHasTools && !toHasTools) {
    const before = messages.length;
    messages = stripToolContent(messages);
    strippedCount = before - messages.length;
  }

  const summary = messages.map(
    (m) =>
      `[${m.role.toUpperCase()}] ${m.content.length > 120 ? m.content.slice(0, 120) + "…" : m.content}`
  );

  return { messages, summary, strippedCount };
}
