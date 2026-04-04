import { useEffect } from "react";
import { PROVIDER_META } from "../../store/providerStore";
import type { ProviderId } from "@wren/shared";
import styles from "./ContextBridgeDialog.module.css";

interface Props {
  fromProviderId: ProviderId;
  toProviderId: ProviderId;
  /** Human-readable summary lines of the context to be transferred */
  summary: string[];
  /** Number of messages that will be stripped due to tool incompatibility */
  strippedCount: number;
  onTransfer: () => void;
  onFresh: () => void;
  onCancel: () => void;
}

export function ContextBridgeDialog({
  fromProviderId,
  toProviderId,
  summary,
  strippedCount,
  onTransfer,
  onFresh,
  onCancel,
}: Props) {
  const fromMeta = PROVIDER_META[fromProviderId];
  const toMeta = PROVIDER_META[toProviderId];

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className={styles.dialog}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Switch AI Provider</span>
          <button className={styles.closeBtn} onClick={onCancel} title="Cancel (Esc)">
            ×
          </button>
        </div>

        {/* Provider transition */}
        <div className={styles.transition}>
          <span
            className={styles.providerTag}
            style={{
              background: (fromMeta?.color ?? "#666") + "22",
              color: fromMeta?.color ?? "#888",
            }}
          >
            <span
              className={styles.providerDot}
              style={{ background: fromMeta?.color ?? "#666" }}
            />
            {fromMeta?.name ?? fromProviderId}
          </span>
          <span className={styles.arrow}>→</span>
          <span
            className={styles.providerTag}
            style={{
              background: (toMeta?.color ?? "#666") + "22",
              color: toMeta?.color ?? "#888",
            }}
          >
            <span
              className={styles.providerDot}
              style={{ background: toMeta?.color ?? "#666" }}
            />
            {toMeta?.name ?? toProviderId}
          </span>
          <span style={{ flex: 1 }} />
          <span>{summary.length} message{summary.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Tool-strip warning */}
        {strippedCount > 0 && (
          <div className={styles.stripWarning}>
            ⚠ {strippedCount} message{strippedCount !== 1 ? "s" : ""} with tool calls will be
            removed — {toMeta?.name ?? toProviderId} does not support them.
          </div>
        )}

        {/* Context preview */}
        <div className={styles.previewHeader}>Context preview</div>

        {summary.length === 0 ? (
          <div className={styles.empty}>No messages to transfer.</div>
        ) : (
          <div className={styles.preview}>
            {summary.map((line, i) => (
              <div key={i} className={styles.previewRow}>
                {line}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className={styles.footer}>
          <button className={styles.btnFresh} onClick={onFresh}>
            Start fresh
          </button>
          <button className={styles.btnTransfer} onClick={onTransfer}>
            Transfer context
          </button>
        </div>
      </div>
    </div>
  );
}
