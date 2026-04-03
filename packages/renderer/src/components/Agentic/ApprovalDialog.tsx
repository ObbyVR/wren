import { useEffect } from "react";
import { useAgentic } from "../../store/agenticStore";
import styles from "./ApprovalDialog.module.css";

const ACTION_ICONS: Record<string, string> = {
  readFile: "📄",
  writeFile: "✏️",
  deleteFile: "🗑",
  runCommand: "⚡",
  listDir: "📁",
  rollback: "↩",
};

const ACTION_LABELS: Record<string, string> = {
  readFile: "Read file",
  writeFile: "Write file",
  deleteFile: "Delete file",
  runCommand: "Run command",
  listDir: "List directory",
  rollback: "Rollback",
};

export function ApprovalDialog() {
  const { pendingApproval, approve, approveAll, reject } = useAgentic();

  // Keyboard: Enter = approve, Escape = reject
  useEffect(() => {
    if (!pendingApproval) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); approve(); }
      if (e.key === "Escape") { e.preventDefault(); reject(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [pendingApproval, approve, reject]);

  if (!pendingApproval) return null;

  const icon = ACTION_ICONS[pendingApproval.action] ?? "🤖";
  const label = ACTION_LABELS[pendingApproval.action] ?? pendingApproval.action;
  const target = pendingApproval.path ?? pendingApproval.command ?? "";

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Action approval">
      <div className={styles.dialog}>
        <div className={styles.header}>
          <span className={styles.icon}>{icon}</span>
          <div className={styles.titleBlock}>
            <span className={styles.title}>AI wants to {label.toLowerCase()}</span>
            {target && <span className={styles.target}>{target}</span>}
          </div>
        </div>

        {pendingApproval.diff && (
          <pre className={styles.diff}>{pendingApproval.diff}</pre>
        )}

        <div className={styles.actions}>
          <button className={styles.btnReject} onClick={reject} title="Reject (Esc)">
            Reject
          </button>
          <button className={styles.btnApproveAll} onClick={approveAll} title="Approve all — switch to Auto mode">
            Approve All
          </button>
          <button className={styles.btnApprove} onClick={approve} title="Approve (Enter)">
            Approve
          </button>
        </div>

        <p className={styles.hint}>Enter to approve · Esc to reject</p>
      </div>
    </div>
  );
}
