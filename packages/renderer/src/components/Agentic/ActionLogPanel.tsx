import { useRef, useEffect } from "react";
import { useAgentic } from "../../store/agenticStore";
import type { AgenticAction } from "@wren/shared";
import styles from "./ActionLogPanel.module.css";

const ACTION_ICONS: Record<string, string> = {
  readFile: "📄",
  writeFile: "✏️",
  deleteFile: "🗑",
  runCommand: "⚡",
  listDir: "📁",
  rollback: "↩",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function ActionRow({ action }: { action: AgenticAction }) {
  const icon = ACTION_ICONS[action.type] ?? "🤖";
  const label = action.path ?? action.command ?? action.type;
  const isError = action.status === "error";
  const isRolledBack = action.type === "rollback";

  return (
    <div className={`${styles.row} ${isError ? styles.rowError : ""} ${isRolledBack ? styles.rowRollback : ""}`}>
      <span className={styles.rowIcon}>{icon}</span>
      <span className={styles.rowLabel} title={label}>{label}</span>
      <span className={styles.rowTime}>{formatTime(action.timestamp)}</span>
      <span className={`${styles.rowStatus} ${isError ? styles.statusError : styles.statusOk}`}>
        {isError ? "err" : isRolledBack ? "↩" : "ok"}
      </span>
    </div>
  );
}

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export function ActionLogPanel({ isOpen, onToggle }: Props) {
  const { actionLog, clearLog, rollback, rollbackAll } = useAgentic();
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [actionLog, isOpen]);

  const hasRollbackable = actionLog.some((a) => a.snapshotId && a.status === "success" && a.type !== "rollback");

  return (
    <div className={`${styles.panel} ${isOpen ? styles.panelOpen : styles.panelClosed}`}>
      {/* Header — always visible */}
      <button className={styles.header} onClick={onToggle} title={isOpen ? "Collapse action log" : "Expand action log"}>
        <span className={styles.headerIcon}>🤖</span>
        <span className={styles.headerTitle}>Action Log</span>
        {actionLog.length > 0 && (
          <span className={styles.badge}>{actionLog.length}</span>
        )}
        <span className={styles.chevron}>{isOpen ? "▼" : "▲"}</span>
      </button>

      {isOpen && (
        <div className={styles.body}>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            <span className={styles.count}>{actionLog.length} actions</span>
            <div className={styles.toolbarActions}>
              {hasRollbackable && (
                <>
                  <button
                    className={styles.btnSmall}
                    onClick={() => void rollback()}
                    title="Undo last action"
                  >
                    ↩ Undo
                  </button>
                  <button
                    className={styles.btnSmallDanger}
                    onClick={() => void rollbackAll()}
                    title="Undo all actions this session"
                  >
                    ↩↩ Undo All
                  </button>
                </>
              )}
              {actionLog.length > 0 && (
                <button className={styles.btnSmall} onClick={clearLog} title="Clear log">
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Log list */}
          {actionLog.length === 0 ? (
            <div className={styles.empty}>No actions yet. Enable agentic mode in the chat panel.</div>
          ) : (
            <div className={styles.list} ref={listRef}>
              {actionLog.map((action) => (
                <ActionRow key={action.id} action={action} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
