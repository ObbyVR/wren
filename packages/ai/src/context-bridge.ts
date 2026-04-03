import type { AiMessage } from "@wren/shared";

/**
 * Neutral message format for cross-provider context transfer.
 * This is a simple array of { role, content } tuples — provider-agnostic.
 */
export type NeutralHistory = AiMessage[];

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
 * Returns the history as an array of formatted strings for display purposes
 * (e.g. to show the user what was transferred) while the actual messages
 * stay as AiMessage[] for the new provider to consume.
 */
export function transferContext(
  history: AiMessage[],
  _fromProviderId: string,
  _toProviderId: string
): { messages: AiMessage[]; summary: string[] } {
  const neutral = serializeHistory(history);
  const messages = deserializeHistory(neutral);

  const summary = messages.map(
    (m) =>
      `[${m.role.toUpperCase()}] ${m.content.length > 120 ? m.content.slice(0, 120) + "…" : m.content}`
  );

  return { messages, summary };
}
