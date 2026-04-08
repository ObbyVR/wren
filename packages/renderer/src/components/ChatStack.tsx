import { useState, useCallback, useEffect, useRef } from "react";
import type { ProviderId } from "@wren/shared";
import { useChatSessions } from "../store/chatSessionStore";
import { PROVIDER_META } from "../store/providerStore";
import { ChatPanel } from "./ChatPanel";
import { ChatWebView } from "./ChatWebView";
import { NewChatPicker } from "./NewChatPicker";
import styles from "./ChatStack.module.css";

export function ChatStack() {
  const { sessions, toggleCollapse, removeSession } = useChatSessions();
  const [pickerOpen, setPickerOpen] = useState(false);
  const prevCollapsedRef = useRef<Record<string, boolean>>({});

  const handleTogglePicker = useCallback(() => {
    setPickerOpen((v) => !v);
  }, []);

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false);
  }, []);

  // Notify main process when browser sessions collapse/expand
  useEffect(() => {
    const prev = prevCollapsedRef.current;
    for (const session of sessions) {
      if (session.mode !== "browser") continue;
      const wasCollapsed = prev[session.id];
      if (wasCollapsed !== undefined && wasCollapsed !== session.collapsed) {
        window.wren.invoke("chat-view:set-visible", {
          sessionId: session.id,
          visible: !session.collapsed,
        });
      }
    }
    // Update ref
    const next: Record<string, boolean> = {};
    for (const s of sessions) next[s.id] = s.collapsed;
    prevCollapsedRef.current = next;
  }, [sessions]);

  return (
    <div className={styles.root}>
      {/* Stack header */}
      <div className={styles.stackHeader}>
        <span className={styles.stackLabel}>Chats</span>
        <div className={styles.newChatWrapper}>
          <button
            className={styles.newChatBtn}
            onClick={handleTogglePicker}
            title="New chat session"
          >
            + New Chat
          </button>
          {pickerOpen && <NewChatPicker onClose={handlePickerClose} />}
        </div>
      </div>

      {/* Accordion sessions */}
      <div className={styles.sessionList}>
        {sessions.map((session) => {
          const meta = PROVIDER_META[session.providerId as ProviderId];
          const color = meta?.color ?? "#888";
          const canClose = sessions.length > 1;
          const isBrowser = session.mode === "browser"; // only "browser" uses WebContentsView; "subscription" uses ChatPanel + CLI

          return (
            <div
              key={session.id}
              className={`${styles.sessionItem} ${session.collapsed ? styles.sessionCollapsed : ""}`}
            >
              {/* Accordion header */}
              <button
                className={styles.sessionHeader}
                onClick={() => toggleCollapse(session.id)}
                style={{ borderLeftColor: color }}
              >
                <span className={styles.providerDot} style={{ background: color }} />
                <span className={styles.sessionLabel}>{session.label}</span>
                {isBrowser ? (
                  <span className={styles.sessionModel}>web</span>
                ) : (
                  <span className={styles.sessionModel}>{session.modelId}</span>
                )}
                <span className={styles.chevron}>
                  {session.collapsed ? "\u25B6" : "\u25BC"}
                </span>
                {canClose && (
                  <button
                    className={styles.closeBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Clean up persisted messages
                      try { localStorage.removeItem(`wren:chatMessages:${session.id}`); } catch { /* ignore */ }
                      removeSession(session.id);
                    }}
                    title="Close chat"
                  >
                    ×
                  </button>
                )}
              </button>

              {/* Chat body — hidden when collapsed */}
              {!session.collapsed && (
                <div className={styles.sessionBody}>
                  {isBrowser ? (
                    <ChatWebView
                      sessionId={session.id}
                      providerId={session.providerId}
                    />
                  ) : (
                    <ChatPanel
                      sessionId={session.id}
                      providerId={session.providerId}
                      modelId={session.modelId}
                      sessionMode={session.mode === "subscription" ? "subscription" : "api"}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
