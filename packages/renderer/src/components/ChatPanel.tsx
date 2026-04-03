import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import { KeySettings } from "./KeySettings";
import styles from "./ChatPanel.module.css";
import type { AiModel } from "@wren/shared";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeRequestId = useRef<string | null>(null);

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

    return () => {
      offChunk();
      offDone();
      offError();
    };
  }, []);

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
    });
  }, [input, streaming, selectedModel, hasKey, messages]);

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
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>AI Chat</span>
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
      </div>

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
                {msg.role === "user" ? "You" : "Claude"}
              </span>
              <div className={styles.messageBody}>
                {msg.role === "assistant" ? (
                  <>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                    {msg.streaming && msg.content === "" && (
                      <div className={styles.thinkingRow}>
                        <span className={styles.dots}>
                          <span>•</span>
                          <span>•</span>
                          <span>•</span>
                        </span>
                      </div>
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
            placeholder={hasKey ? "Message Claude… (Enter to send)" : "Add API key to start chatting"}
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
    </div>
  );
}
