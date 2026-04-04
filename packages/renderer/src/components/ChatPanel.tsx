import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import { KeySettings } from "./KeySettings";
import { ContextBridgeDialog } from "./ContextBridgeDialog/ContextBridgeDialog";
import { PROVIDER_META } from "../store/providerStore";
import { useProjects } from "../store/projectStore";
import { useCost } from "../store/costStore";
import { useAgentic } from "../store/agenticStore";
import styles from "./ChatPanel.module.css";
import type { AiMessage, AiModel, AiToolCall, AiToolResult, ProviderId } from "@wren/shared";

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

interface BridgePending {
  fromProviderId: ProviderId;
  toProviderId: ProviderId;
  summary: string[];
  strippedCount: number;
  transferredMessages: AiMessage[];
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
function nextRequestId() { return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [hasKey, setHasKey] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [lastUsage, setLastUsage] = useState<{ in: number; out: number } | null>(null);
  const [bridgePending, setBridgePending] = useState<BridgePending | null>(null);

  const { activeProject } = useProjects();
  const { recordUsage } = useCost();
  const { agenticEnabled, toggleAgentic, pendingApproval, settings } = useAgentic();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeRequestId = useRef<string | null>(null);
  // Track the last known providerId so we can detect switches
  const prevProviderIdRef = useRef<ProviderId | null>(null);

  // Scroll to bottom on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load key status and models on mount
  useEffect(() => {
    void window.wren.invoke("ai:get-key-status").then(({ hasKey: h }) => {
      setHasKey(h);
      if (h) {
        void window.wren.invoke("ai:list-models").then((m) => {
          setModels(m);
          if (m.length > 0) setSelectedModel(m[0].id);
        });
      }
    });
  }, []);

  // Detect provider switch — if there are messages in history, trigger Context Bridge dialog
  useEffect(() => {
    if (!activeProject) return;
    const current = activeProject.providerId;

    if (prevProviderIdRef.current === null) {
      // First render — just record the provider, no dialog
      prevProviderIdRef.current = current;
      return;
    }

    if (prevProviderIdRef.current === current) return;

    const prev = prevProviderIdRef.current;
    prevProviderIdRef.current = current;

    // Only show dialog if there are existing messages
    if (messages.length === 0) return;

    // Call transfer-context IPC to get the summary and stripped count
    const history: AiMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    void window.wren.invoke("ai:transfer-context", {
      messages: history,
      fromProviderId: toMainProviderId(prev),
      toProviderId: toMainProviderId(current),
    }).then((result) => {
      setBridgePending({
        fromProviderId: prev,
        toProviderId: current,
        summary: result.summary,
        strippedCount: result.strippedCount,
        transferredMessages: result.messages,
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.providerId]);

  // Refresh models when key changes (after settings close)
  const handleSettingsClose = useCallback(() => {
    setShowSettings(false);
    void window.wren.invoke("ai:get-key-status").then(({ hasKey: h }) => {
      setHasKey(h);
      if (h) {
        void window.wren.invoke("ai:list-models").then((m) => {
          setModels(m);
          if (m.length > 0 && !selectedModel) setSelectedModel(m[0].id);
        });
      }
    });
  }, [selectedModel]);

  // Subscribe to streaming events
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
          activeProject.providerId,
          event.inputTokens,
          event.outputTokens,
        );
      }
    });

    const offError = window.wren.onAiStreamError((event) => {
      if (event.requestId !== activeRequestId.current) return;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === activeRequestId.current
            ? { ...msg, content: `⚠️ ${event.error}`, streaming: false }
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
  }, [activeProject]);

  // ── Context Bridge handlers ──────────────────────────────────────────────────

  const handleBridgeTransfer = useCallback(() => {
    if (!bridgePending) return;
    // Replace the current messages with the transferred (possibly stripped) ones
    const transferred: ChatMessage[] = bridgePending.transferredMessages.map((m) => ({
      id: nextId(),
      role: m.role,
      content: m.content,
    }));
    setMessages(transferred);
    setBridgePending(null);
  }, [bridgePending]);

  const handleBridgeFresh = useCallback(() => {
    setMessages([]);
    setBridgePending(null);
  }, []);

  const handleBridgeCancel = useCallback(() => {
    // User cancelled — do not change messages; revert provider indication
    // (the project provider was already changed, so we just dismiss)
    setBridgePending(null);
  }, []);

  // ── Send message ─────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !selectedModel) return;
    if (!hasKey) {
      setShowSettings(true);
      return;
    }

    const requestId = nextRequestId();
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

    const providerId = activeProject ? toMainProviderId(activeProject.providerId) : "claude";

    await window.wren.invoke("ai:send-message", {
      requestId,
      messages: history,
      model: selectedModel,
      providerId,
      ...(agenticEnabled && activeProject?.rootPath
        ? {
            agenticMode: true,
            projectRoot: activeProject.rootPath,
          }
        : {}),
    });
  }, [input, streaming, selectedModel, hasKey, messages, agenticEnabled, activeProject]);

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

  const providerMeta = activeProject
    ? PROVIDER_META[activeProject.providerId]
    : null;

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>AI Chat</span>

        {/* Provider badge */}
        {providerMeta && (
          <span
            className={styles.providerBadge}
            style={{
              background: providerMeta.color + "22",
              color: providerMeta.color,
            }}
            title={`Provider: ${providerMeta.name}`}
          >
            {providerMeta.name}
          </span>
        )}

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
        <button
          className={styles.keyBtn}
          onClick={() => setShowSettings(true)}
          title="API key settings"
        >
          <span className={`${styles.keyDot} ${hasKey ? styles.keyDotActive : ""}`} />
          Key
        </button>

        {/* Agentic mode toggle */}
        <button
          className={`${styles.agenticBtn} ${agenticEnabled ? styles.agenticBtnActive : ""}`}
          onClick={toggleAgentic}
          title={agenticEnabled ? `Agentic mode ON (${settings.approvalMode}) — click to disable` : "Enable agentic mode"}
        >
          <span className={`${styles.agenticDot} ${agenticEnabled ? styles.agenticDotActive : ""}`} />
          {agenticEnabled ? `Agent · ${settings.approvalMode}` : "Agent"}
        </button>
      </div>

      {/* Agentic pending indicator */}
      {pendingApproval && (
        <div className={styles.agenticPending}>
          <span className={styles.agenticPendingDot} />
          Waiting for approval…
        </div>
      )}

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>✦</span>
            <span>Ask anything</span>
            {!hasKey && (
              <button
                className={styles.keyBtn}
                style={{ marginTop: "0.5rem" }}
                onClick={() => setShowSettings(true)}
              >
                + Add API key to start
              </button>
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={styles.message}>
              <span
                className={`${styles.messageRole} ${msg.role === "assistant" ? styles.assistant : ""}`}
              >
                {msg.role === "user" ? "You" : (providerMeta?.name ?? "Claude")}
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
                                <span className={styles.toolCallIcon}>⚙️</span>
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
                                <span className={styles.toolCallIcon}>{ev.toolResult.isError ? "❌" : "✓"}</span>
                                <div>
                                  <span className={styles.toolCallName}>{ev.toolResult.name}</span>
                                  <div className={styles.toolCallResult}>{preview}{ev.toolResult.output.length > 100 ? "…" : ""}</div>
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
                          <span>•</span>
                          <span>•</span>
                          <span>•</span>
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

      {/* Usage */}
      {lastUsage && (
        <div className={styles.usage}>
          {lastUsage.in} in · {lastUsage.out} out tokens
        </div>
      )}

      {/* Input */}
      <div className={styles.inputArea}>
        <div className={styles.inputRow}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder={hasKey ? "Message… (Enter to send)" : "Add API key to start chatting"}
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
            ↑
          </button>
        </div>
        <p className={styles.hint}>Shift+Enter for new line</p>
      </div>

      {/* Key Settings modal */}
      {showSettings && <KeySettings onClose={handleSettingsClose} />}

      {/* Context Bridge dialog — shown when provider switches with existing history */}
      {bridgePending && (
        <ContextBridgeDialog
          fromProviderId={bridgePending.fromProviderId}
          toProviderId={bridgePending.toProviderId}
          summary={bridgePending.summary}
          strippedCount={bridgePending.strippedCount}
          onTransfer={handleBridgeTransfer}
          onFresh={handleBridgeFresh}
          onCancel={handleBridgeCancel}
        />
      )}
    </div>
  );
}
