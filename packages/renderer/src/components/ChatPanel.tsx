import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import { PROVIDER_META } from "../store/providerStore";
import { useProjects } from "../store/projectStore";
import { useCost } from "../store/costStore";
import { useAgentic } from "../store/agenticStore";
import styles from "./ChatPanel.module.css";
import type { AiModel, AiToolCall, AiToolResult, ProviderId } from "@wren/shared";
import { ChatHistory } from "./ChatHistory";

interface ToolEvent {
  kind: "tool_call" | "tool_result";
  toolCall?: AiToolCall;
  toolResult?: AiToolResult;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  toolEvents?: ToolEvent[];
}

function toolCallSummary(tc: AiToolCall): string {
  const arg = Object.values(tc.input)[0];
  return typeof arg === "string" ? arg : JSON.stringify(tc.input).slice(0, 80);
}

/**
 * Map renderer-side ProviderId ("anthropic") to the main-process ProviderId
 * ("claude") used by key-store and provider builders.
 */
function toMainProviderId(id: ProviderId): string {
  if (id === "anthropic") return "claude";
  return id;
}

let msgCounter = 0;
function nextId() { return `msg-${++msgCounter}`; }
function nextRequestId(sessionId: string) {
  return `req-${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── CLI subscription model lists (no API needed) ─────────────────────────────

const CLI_MODELS: Record<string, AiModel[]> = {
  anthropic: [
    { id: "claude-sonnet-4-6", name: "Sonnet 4.6", providerId: "claude" },
    { id: "claude-opus-4-6", name: "Opus 4.6", providerId: "claude" },
    { id: "claude-haiku-4-5", name: "Haiku 4.5", providerId: "claude" },
  ],
  openai: [
    { id: "default", name: "Codex (default)", providerId: "openai" },
    { id: "o3-mini", name: "o3-mini", providerId: "openai" },
  ],
  gemini: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", providerId: "gemini" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", providerId: "gemini" },
  ],
};

// ── Message persistence ──────────────────────────────────────────────────────

function loadMessages(sessionId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`wren:chatMessages:${sessionId}`);
    if (raw) {
      const msgs = JSON.parse(raw) as ChatMessage[];
      // Strip streaming state from persisted messages
      return msgs.map((m) => ({ ...m, streaming: false }));
    }
  } catch { /* ignore */ }
  return [];
}

function saveMessages(sessionId: string, msgs: ChatMessage[]) {
  // Keep last 100 messages to prevent localStorage bloat
  const toSave = msgs.slice(-100).map(({ id, role, content }) => ({ id, role, content }));
  try {
    localStorage.setItem(`wren:chatMessages:${sessionId}`, JSON.stringify(toSave));
  } catch { /* quota exceeded — silently drop */ }
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ChatPanelProps {
  sessionId: string;
  providerId: ProviderId;
  modelId: string;
  /** "subscription" = local CLI, "api" = SDK with API key */
  sessionMode?: "subscription" | "api";
}

export function ChatPanel({ sessionId, providerId, modelId, sessionMode = "api" }: ChatPanelProps) {
  const isSubscription = sessionMode === "subscription";
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(sessionId));
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(modelId);
  const [hasKey, setHasKey] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [lastUsage, setLastUsage] = useState<{ in: number; out: number } | null>(null);

  const { activeProject } = useProjects();
  const { recordUsage } = useCost();
  const { agenticEnabled, pendingApproval, settings } = useAgentic();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeRequestId = useRef<string | null>(null);

  const providerMeta = PROVIDER_META[providerId];
  const mainProviderId = toMainProviderId(providerId);

  // Scroll to bottom on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load key status and models on mount / provider change
  useEffect(() => {
    if (isSubscription) {
      // Subscription mode — no API key needed, CLI handles auth.
      // Populate models from hardcoded list (can't query API without key).
      setHasKey(true);
      const cliModels = CLI_MODELS[providerId] ?? CLI_MODELS.anthropic;
      setModels(cliModels);
      if (!cliModels.some((m) => m.id === selectedModel) && cliModels.length > 0) {
        setSelectedModel(cliModels[0].id);
      }
      return;
    }
    void window.wren.invoke("ai:get-key-status").then(({ hasKey: h }) => {
      setHasKey(h);
      if (h) {
        void window.wren.invoke("ai:list-models").then((m) => {
          // Filter models for this provider
          const providerModels = m.filter(
            (mod) => mod.providerId === mainProviderId || mod.providerId === providerId,
          );
          const allModels = providerModels.length > 0 ? providerModels : m;
          setModels(allModels);
          // Keep selectedModel if it exists in the list, otherwise pick first
          if (!allModels.some((mod) => mod.id === selectedModel) && allModels.length > 0) {
            setSelectedModel(allModels[0].id);
          }
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, isSubscription]);

  // Subscribe to streaming events — scoped to this session's requestIds
  useEffect(() => {
    const offChunk = window.wren.onAiStreamChunk((event) => {
      if (event.requestId !== activeRequestId.current) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === activeRequestId.current
            ? { ...msg, content: msg.content + event.text }
            : msg
        )
      );
    });

    const offDone = window.wren.onAiStreamDone((event) => {
      if (event.requestId !== activeRequestId.current) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === activeRequestId.current
            ? { ...msg, streaming: false }
            : msg
        )
      );
      setLastUsage({ in: event.inputTokens, out: event.outputTokens });
      setStreaming(false);
      activeRequestId.current = null;

      // Record cost
      if (activeProject) {
        recordUsage(
          activeProject.id,
          activeProject.name,
          providerId,
          event.inputTokens,
          event.outputTokens,
        );
      }

      // Persist messages after response completes
      setMessages((prev) => { saveMessages(sessionId, prev); return prev; });
    });

    const offError = window.wren.onAiStreamError((event) => {
      if (event.requestId !== activeRequestId.current) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === activeRequestId.current
            ? { ...msg, content: `\u26A0\uFE0F ${event.error}`, streaming: false }
            : msg
        )
      );
      setStreaming(false);
      activeRequestId.current = null;
    });

    const offToolCall = window.wren.onAiStreamToolCall((event) => {
      if (event.requestId !== activeRequestId.current) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === activeRequestId.current
            ? {
                ...msg,
                toolEvents: [
                  ...(msg.toolEvents ?? []),
                  { kind: "tool_call" as const, toolCall: event.toolCall },
                ],
              }
            : msg
        )
      );
    });

    const offToolResult = window.wren.onAiStreamToolResult((event) => {
      if (event.requestId !== activeRequestId.current) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === activeRequestId.current
            ? {
                ...msg,
                toolEvents: [
                  ...(msg.toolEvents ?? []),
                  { kind: "tool_result" as const, toolResult: event.toolResult },
                ],
              }
            : msg
        )
      );
    });

    return () => {
      offChunk();
      offDone();
      offError();
      offToolCall();
      offToolResult();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject, providerId]);

  // ── Send message ─────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !selectedModel) return;
    if (!hasKey) return;

    const requestId = nextRequestId(sessionId);
    const userMsg: ChatMessage = { id: nextId(), role: "user", content: text };
    const assistantMsg: ChatMessage = {
      id: requestId,
      role: "assistant",
      content: "",
      streaming: true,
      toolEvents: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);
    setLastUsage(null);
    activeRequestId.current = requestId;

    // Resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "20px";
    }

    const history: Array<{ role: "user" | "assistant"; content: string }> = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: text },
    ];

    await window.wren.invoke("ai:send-message", {
      requestId,
      messages: history,
      model: selectedModel,
      providerId: mainProviderId,
      sessionMode,
      chatSessionId: sessionId,
      ...(agenticEnabled && activeProject?.rootPath
        ? {
            agenticMode: true,
            projectRoot: activeProject.rootPath,
          }
        : {}),
    });
  }, [input, streaming, selectedModel, hasKey, messages, agenticEnabled, activeProject, sessionId, mainProviderId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "20px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  return (
    <div className={styles.root}>
      {/* History sidebar overlay */}
      {showHistory && (
        <ChatHistory
          currentSessionId={sessionId}
          providerId={providerId}
          onClose={() => setShowHistory(false)}
          onLoadSession={(_sid, msgs) => {
            setMessages(msgs.map((m) => ({ ...m, streaming: false, toolEvents: [] })));
          }}
        />
      )}

      {/* Compact toolbar — model selector only */}
      <div className={styles.toolbar}>
        {models.length > 0 && (
          <select
            className={styles.modelSelect}
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}

        {/* Agentic mode indicator */}
        {agenticEnabled && (
          <span className={styles.agenticBtnActive} title={`Agent ${settings.approvalMode}`}>
            Agent
          </span>
        )}

        <span className={styles.toolbarSpacer} />

        {lastUsage && (
          <span className={styles.usageInline}>
            {lastUsage.in}in {lastUsage.out}out
          </span>
        )}

        <button
          className={styles.historyBtn}
          onClick={() => setShowHistory((v) => !v)}
          title="Chat history"
        >
          &#x29D6;
        </button>
      </div>

      {/* Agentic pending indicator */}
      {pendingApproval && (
        <div className={styles.agenticPending}>
          <span className={styles.agenticPendingDot} />
          Waiting for approval\u2026
        </div>
      )}

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>✦</span>
            <span>Ask anything</span>
            {!hasKey && (
              <span className={styles.noKeyHint}>
                Configure API key in Settings
              </span>
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`${styles.message} ${msg.role === "user" ? styles.userMessage : ""}`}>
              <span
                className={`${styles.messageRole} ${msg.role === "assistant" ? styles.assistant : ""}`}
              >
                {msg.role === "user" ? "You" : (providerMeta?.name ?? "AI")}
              </span>
              <div className={styles.messageBody}>
                {msg.role === "assistant" ? (
                  <>
                    {/* Tool call/result events */}
                    {msg.toolEvents && msg.toolEvents.length > 0 && (
                      <div style={{ marginBottom: "0.4rem", display: "flex", flexDirection: "column", gap: "3px" }}>
                        {msg.toolEvents.map((ev, i) => {
                          if (ev.kind === "tool_call" && ev.toolCall) {
                            return (
                              <div key={i} className={styles.toolCallRow}>
                                <span className={styles.toolCallIcon}>\u2699\uFE0F</span>
                                <div>
                                  <span className={styles.toolCallName}>{ev.toolCall.name}</span>
                                  {" "}
                                  <span className={styles.toolCallArg}>{toolCallSummary(ev.toolCall)}</span>
                                </div>
                              </div>
                            );
                          }
                          if (ev.kind === "tool_result" && ev.toolResult) {
                            const preview = ev.toolResult.output.slice(0, 100);
                            return (
                              <div key={i} className={`${styles.toolCallRow} ${ev.toolResult.isError ? styles.toolCallError : ""}`}>
                                <span className={styles.toolCallIcon}>{ev.toolResult.isError ? "\u274C" : "\u2713"}</span>
                                <div>
                                  <span className={styles.toolCallName}>{ev.toolResult.name}</span>
                                  <div className={styles.toolCallResult}>{preview}{ev.toolResult.output.length > 100 ? "\u2026" : ""}</div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                    {msg.streaming && msg.content === "" && (msg.toolEvents?.length ?? 0) === 0 && (
                      <div className={styles.thinkingRow}>
                        <span className={styles.dots}>
                          <span>\u2022</span>
                          <span>\u2022</span>
                          <span>\u2022</span>
                        </span>
                      </div>
                    )}
                    {msg.streaming && msg.content === "" && (msg.toolEvents?.length ?? 0) > 0 && (
                      <span className={styles.cursor} />
                    )}
                    {msg.streaming && msg.content !== "" && (
                      <span className={styles.cursor} />
                    )}
                  </>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder={hasKey ? "Message\u2026 (Enter to send)" : "Add API key to start chatting"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={streaming || !hasKey}
          />
          <button
            className={styles.sendBtn}
            onClick={() => void sendMessage()}
            disabled={streaming || !input.trim() || !hasKey}
            title="Send (Enter)"
          >
            \u2191
          </button>
        </div>
        <p className={styles.hint}>Shift+Enter for new line</p>
      </div>
    </div>
  );
}
