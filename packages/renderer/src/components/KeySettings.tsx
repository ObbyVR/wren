import { useState, useEffect } from "react";
import styles from "./KeySettings.module.css";

interface Props {
  onClose: () => void;
}

export function KeySettings({ onClose }: Props) {
  const [hasKey, setHasKey] = useState(false);
  const [inputKey, setInputKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.wren.invoke("ai:get-key-status").then(({ hasKey: h }) => setHasKey(h));
  }, []);

  const handleSave = async () => {
    if (!inputKey.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.wren.invoke("ai:set-key", { key: inputKey.trim() });
      if (result.valid) {
        setHasKey(true);
        setInputKey("");
        onClose();
      } else {
        setError(result.error ?? "Invalid key");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    await window.wren.invoke("ai:remove-key");
    setHasKey(false);
  };

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialog}>
        <p className={styles.title}>Anthropic API Key</p>
        <p className={styles.description}>
          Your key is stored encrypted on disk using your OS keychain.
          It is never sent to any server other than Anthropic.
        </p>

        <div className={styles.keyStatus}>
          <span className={`${styles.dot} ${hasKey ? styles.dotGreen : styles.dotGray}`} />
          <span className={styles.keyLabel}>
            {hasKey ? "API key set" : "No key configured"}
          </span>
          {hasKey && (
            <button className={styles.removeBtn} onClick={handleRemove}>
              Remove
            </button>
          )}
        </div>

        {!hasKey && (
          <>
            <input
              className={styles.input}
              type="password"
              placeholder="sk-ant-..."
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
              autoFocus
            />
            {error && <p className={styles.error}>{error}</p>}
          </>
        )}

        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={onClose}>Close</button>
          {!hasKey && (
            <button
              className={styles.btnPrimary}
              onClick={() => void handleSave()}
              disabled={loading || !inputKey.trim()}
            >
              {loading ? "Validating…" : "Save Key"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
