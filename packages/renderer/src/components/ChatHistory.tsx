import { useState, useEffect, useRef } from "react";
import type { ProviderId } from "@wren/shared";
import { PROVIDER_META } from "../store/providerStore";
import styles from "./ChatHistory.module.css";

interface HistoryEntry {
  sessionId: string;
  label: string;
  providerId: string;
  messageCount: number;
  preview: string;
  timestamp: number;
}

interface ChatHistoryProps {
  currentSessionId: string;
  providerId: ProviderId;
  onClose: () => void;
  onLoadSession: (sessionId: string, messages: Array<{ id: string; role: "user" | "assistant"; content: string }>) => void;
  onNewSession: () => void;
}

/**
 * Scan localStorage for saved chat messages and build a history list.
 */
function buildHistoryEntries(): HistoryEntry[] {
  const entries: HistoryEntry[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("wren:chatMessages:")) continue;

    const sessionId = key.replace("wren:chatMessages:", "");
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const msgs = JSON.parse(raw) as Array<{ role: string; content: string }>;
      if (msgs.length === 0) continue;

      // Find the first user message for preview
      const firstUser = msgs.find((m) => m.role === "user");
      const preview = firstUser?.content.slice(0, 60) ?? msgs[0].content.slice(0, 60);

      // Try to get session metadata — match exact or base ID (for archived sessions)
      // Archived sessions have format "{baseId}-{timestamp}"
      const baseId = sessionId.replace(/-\d{13}$/, ""); // strip archive timestamp
      let label = "";
      let providerId = "anthropic";
      for (let j = 0; j < localStorage.length; j++) {
        const sKey = localStorage.key(j);
        if (!sKey?.startsWith("wren:chatSessions:")) continue;
        try {
          const sessions = JSON.parse(localStorage.getItem(sKey) ?? "[]");
          const match = sessions.find((s: { id: string }) => s.id === sessionId || s.id === baseId);
          if (match) {
            label = match.label ?? "";
            providerId = match.providerId ?? "anthropic";
            break;
          }
        } catch { /* ignore */ }
      }
      // For archived sessions, add a short label if none found
      if (!label) {
        label = baseId !== sessionId ? `Archived` : sessionId;
      }

      entries.push({
        sessionId,
        label,
        providerId,
        messageCount: msgs.length,
        preview: preview.length >= 60 ? preview + "..." : preview,
        timestamp: Date.now(), // We don't store timestamps yet, use current
      });
    } catch { /* ignore corrupt entries */ }
  }

  return entries;
}

export function ChatHistory({ currentSessionId, providerId, onClose, onLoadSession, onNewSession }: ChatHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const meta = PROVIDER_META[providerId];

  useEffect(() => {
    // Only show sessions for THIS provider
    setEntries(buildHistoryEntries().filter((e) => e.providerId === providerId));
  }, [providerId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSelect = (entry: HistoryEntry) => {
    try {
      const raw = localStorage.getItem(`wren:chatMessages:${entry.sessionId}`);
      if (raw) onLoadSession(entry.sessionId, JSON.parse(raw));
    } catch { /* ignore */ }
    onClose();
  };

  return (
    <div ref={ref} className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <span className={styles.providerDot} style={{ background: meta?.color ?? "#888" }} />
          <span className={styles.title}>{meta?.name ?? "Chat"}</span>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
      </div>

      {/* New session button — prominent */}
      <button
        className={styles.newSessionBtn}
        onClick={() => { onNewSession(); onClose(); }}
      >
        + New {meta?.name ?? "Chat"} Session
      </button>

      <div className={styles.list}>
        {entries.length === 0 ? (
          <div className={styles.empty}>No saved conversations</div>
        ) : (
          entries.map((entry) => {
            const isCurrent = entry.sessionId === currentSessionId;
            return (
              <button
                key={entry.sessionId}
                className={`${styles.item} ${isCurrent ? styles.itemActive : ""}`}
                onClick={() => handleSelect(entry)}
              >
                <div className={styles.itemHeader}>
                  <span className={styles.itemLabel}>{entry.label}</span>
                  <span className={styles.itemCount}>{entry.messageCount} msg</span>
                </div>
                <div className={styles.itemPreview}>{entry.preview}</div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
