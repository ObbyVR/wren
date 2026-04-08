import { useEffect, useRef, useCallback } from "react";
import type { ProviderId, ChatSessionMode } from "@wren/shared";
import { PROVIDER_META, useProviders } from "../store/providerStore";
import { useChatSessions } from "../store/chatSessionStore";
import styles from "./NewChatPicker.module.css";

/** Subscription-mode providers (CLI-based, uses local login) */
const SUBSCRIPTION_PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "anthropic", label: "Claude" },
  { id: "openai", label: "ChatGPT" },
  { id: "gemini", label: "Gemini" },
];

/** API-mode providers (requires API key in Vault) */
const API_PROVIDERS: ProviderId[] = ["anthropic", "openai", "gemini", "ollama"];

interface NewChatPickerProps {
  onClose: () => void;
}

export function NewChatPicker({ onClose }: NewChatPickerProps) {
  const { addSession } = useChatSessions();
  const { getProvider } = useProviders();
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSelect = useCallback(
    (providerId: ProviderId, mode: ChatSessionMode) => {
      addSession(providerId, undefined, mode);
      onClose();
    },
    [addSession, onClose],
  );

  // Check which providers have API keys configured
  const apiProvidersWithKeys = API_PROVIDERS.filter((pid) => {
    const config = getProvider(pid);
    return config?.status === "valid" || config?.apiKey;
  });

  return (
    <div ref={ref} className={styles.picker}>
      {/* Primary: subscription-based (CLI) */}
      <div className={styles.pickerTitle}>Abbonamento</div>
      {SUBSCRIPTION_PROVIDERS.map(({ id, label }) => {
        const meta = PROVIDER_META[id];
        return (
          <button
            key={`sub-${id}`}
            className={styles.pickerItem}
            onClick={() => handleSelect(id, "subscription")}
          >
            <span className={styles.pickerDot} style={{ background: meta.color }} />
            <span className={styles.pickerName}>{label}</span>
          </button>
        );
      })}

      {/* Secondary: API-based (only if keys are configured) */}
      {apiProvidersWithKeys.length > 0 && (
        <>
          <div className={styles.pickerDivider} />
          <div className={styles.pickerTitle}>API</div>
          {apiProvidersWithKeys.map((pid) => {
            const meta = PROVIDER_META[pid];
            return (
              <button
                key={`api-${pid}`}
                className={styles.pickerItem}
                onClick={() => handleSelect(pid, "api")}
              >
                <span className={styles.pickerDot} style={{ background: meta.color }} />
                <span className={styles.pickerName}>{meta.name}</span>
                <span className={styles.pickerNoKey}>(API)</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
