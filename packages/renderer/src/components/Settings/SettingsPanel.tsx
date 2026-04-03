import { useState, useEffect, useCallback } from "react";
import { useProviders, PROVIDER_META } from "../../store/providerStore";
import { useProjects } from "../../store/projectStore";
import { useAgentic } from "../../store/agenticStore";
import type { ProviderId, ProviderConfig, ApprovalMode } from "@wren/shared";
import styles from "./SettingsPanel.module.css";

type Section = "providers" | "agentic" | "appearance" | "shortcuts" | "about";

const PROVIDERS: ProviderId[] = ["anthropic", "openai", "gemini", "ollama"];

interface Props {
  onClose: () => void;
}

// ── Provider row ─────────────────────────────────────────────────────────────

interface ProviderRowProps {
  providerId: ProviderId;
  config: ProviderConfig | undefined;
  onSave: (id: ProviderId, key: string, model?: string) => void;
  onRemove: (id: ProviderId) => void;
  onTest: (id: ProviderId) => void;
}

function ProviderRow({ providerId, config, onSave, onRemove, onTest }: ProviderRowProps) {
  const meta = PROVIDER_META[providerId];
  const [expanded, setExpanded] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [modelInput, setModelInput] = useState(
    config?.defaultModel ?? meta.defaultModel,
  );

  const hasKey = !!config?.keyMasked;
  const statusColor =
    config?.status === "valid"
      ? "#34d07b"
      : config?.status === "invalid"
        ? "#e05c5c"
        : "#4a4a54";

  const handleSave = () => {
    if (!keyInput.trim()) return;
    onSave(providerId, keyInput.trim(), modelInput.trim() || undefined);
    setKeyInput("");
    setExpanded(false);
  };

  return (
    <div className={styles.providerRow}>
      <div className={styles.providerHeader} onClick={() => setExpanded((v) => !v)}>
        <span
          className={styles.providerDot}
          style={{ background: meta.color }}
          title={config?.status ?? "not configured"}
        />
        <span className={styles.providerName}>{meta.name}</span>

        {hasKey && (
          <>
            <span className={styles.keyMasked}>{config!.keyMasked}</span>
            <span className={styles.statusBadge} style={{ color: statusColor }}>
              {config!.status}
            </span>
          </>
        )}

        {!hasKey && (
          <span className={styles.notConfigured}>Not configured</span>
        )}

        <span className={styles.expandChevron}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className={styles.providerBody}>
          {hasKey && (
            <div className={styles.keyInfo}>
              <span className={styles.infoLabel}>Current key:</span>
              <span className={styles.keyMaskedLarge}>{config!.keyMasked}</span>
              <span className={styles.infoLabel}>Default model:</span>
              <span>{config!.defaultModel ?? meta.defaultModel}</span>
            </div>
          )}

          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              {hasKey ? "Replace key" : "API key"}
            </label>
            <input
              className={styles.formInput}
              type="password"
              placeholder={
                providerId === "anthropic"
                  ? "sk-ant-..."
                  : providerId === "openai"
                    ? "sk-..."
                    : providerId === "gemini"
                      ? "AI..."
                      : "http://localhost:11434 or key"
              }
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              autoFocus
            />
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>Default model</label>
            <input
              className={styles.formInput}
              type="text"
              placeholder={meta.defaultModel}
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
            />
          </div>

          <div className={styles.providerActions}>
            {hasKey && (
              <>
                <button
                  className={styles.btnSecondary}
                  onClick={() => onTest(providerId)}
                >
                  Test connection
                </button>
                <button
                  className={styles.btnDanger}
                  onClick={() => {
                    onRemove(providerId);
                    setExpanded(false);
                  }}
                >
                  Remove key
                </button>
              </>
            )}
            <button
              className={styles.btnPrimary}
              disabled={!keyInput.trim()}
              onClick={handleSave}
            >
              Save key
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main settings panel ──────────────────────────────────────────────────────

export function SettingsPanel({ onClose }: Props) {
  const [section, setSection] = useState<Section>("providers");
  const { providers, getProvider, setProviderKey, removeProviderKey, setProviderStatus } =
    useProviders();
  const { projects, activeProject, setProjectProvider } = useProjects();
  const { settings, updateSettings } = useAgentic();

  // Sync legacy Anthropic key from existing KeySettings flow
  useEffect(() => {
    void window.wren.invoke("ai:get-key-status").then(({ hasKey }) => {
      if (hasKey && !getProvider("anthropic")) {
        // Key exists in keychain but not in our store yet — show as configured
        setProviderKey("anthropic", "existing", undefined);
        setProviderStatus("anthropic", "valid");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(
    async (id: ProviderId, key: string, model?: string) => {
      if (id === "anthropic") {
        // Use existing IPC for Anthropic
        const result = await window.wren.invoke("ai:set-key", { key });
        if (result.valid) {
          setProviderKey(id, key, model);
          setProviderStatus(id, "valid");
        } else {
          setProviderKey(id, key, model);
          setProviderStatus(id, "invalid");
        }
      } else {
        setProviderKey(id, key, model);
      }
    },
    [setProviderKey, setProviderStatus],
  );

  const handleRemove = useCallback(
    (id: ProviderId) => {
      if (id === "anthropic") {
        void window.wren.invoke("ai:remove-key");
      }
      removeProviderKey(id);
    },
    [removeProviderKey],
  );

  const handleTest = useCallback(
    async (id: ProviderId) => {
      const config = getProvider(id);
      if (!config?.apiKey) return;
      if (id === "anthropic") {
        const result = await window.wren.invoke("ai:set-key", { key: config.apiKey });
        setProviderStatus(id, result.valid ? "valid" : "invalid");
      }
    },
    [getProvider, setProviderStatus],
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.panel}>
        {/* Sidebar */}
        <nav className={styles.sidebar}>
          <p className={styles.sidebarTitle}>Settings</p>
          {(["providers", "agentic", "appearance", "shortcuts", "about"] as Section[]).map((s) => (
            <button
              key={s}
              className={`${styles.navItem} ${section === s ? styles.navItemActive : ""}`}
              onClick={() => setSection(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className={styles.content}>
          <button className={styles.closeBtn} onClick={onClose} title="Close (Esc)">
            ×
          </button>

          {section === "providers" && (
            <div>
              <h2 className={styles.sectionTitle}>AI Providers</h2>
              <p className={styles.sectionDesc}>
                Manage API keys for each AI provider. Keys are stored encrypted in your OS keychain.
              </p>

              <div className={styles.providerList}>
                {PROVIDERS.map((pid) => (
                  <ProviderRow
                    key={pid}
                    providerId={pid}
                    config={getProvider(pid)}
                    onSave={handleSave}
                    onRemove={handleRemove}
                    onTest={handleTest}
                  />
                ))}
              </div>

              {activeProject && (
                <div className={styles.projectOverride}>
                  <h3 className={styles.overrideTitle}>
                    Per-project override — {activeProject.name}
                  </h3>
                  <p className={styles.sectionDesc}>
                    Override the default provider/model for this project.
                  </p>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Provider</label>
                    <select
                      className={styles.formSelect}
                      value={activeProject.providerId}
                      onChange={(e) =>
                        setProjectProvider(activeProject.id, e.target.value as ProviderId)
                      }
                    >
                      {PROVIDERS.map((pid) => (
                        <option key={pid} value={pid}>
                          {PROVIDER_META[pid].name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {section === "agentic" && (
            <div>
              <h2 className={styles.sectionTitle}>Agentic Mode</h2>
              <p className={styles.sectionDesc}>
                Configure how the AI can take autonomous actions in your projects.
              </p>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Approval mode</label>
                <select
                  className={styles.formSelect}
                  value={settings.approvalMode}
                  onChange={(e) => updateSettings({ approvalMode: e.target.value as ApprovalMode })}
                >
                  <option value="manual">Manual — approve every action</option>
                  <option value="selective">Selective — approve writes &amp; deletes</option>
                  <option value="auto">Auto — approve all actions</option>
                </select>
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Max actions / session</label>
                <input
                  className={styles.formInput}
                  type="number"
                  min={1}
                  max={500}
                  value={settings.maxActionsPerSession}
                  onChange={(e) =>
                    updateSettings({ maxActionsPerSession: Number(e.target.value) })
                  }
                />
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLabel}>Auto-snapshot</label>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={settings.autoSnapshot}
                    onChange={(e) => updateSettings({ autoSnapshot: e.target.checked })}
                  />
                  <span className={styles.toggleSlider} />
                  <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#9090b0" }}>
                    Save a snapshot before each write/delete (enables undo)
                  </span>
                </label>
              </div>

              <div className={styles.sectionDesc} style={{ marginTop: "1rem" }}>
                <strong>Approval modes:</strong><br />
                <em>Manual</em> — a dialog appears before every action.<br />
                <em>Selective</em> — only file writes and deletes require approval; reads and list are automatic.<br />
                <em>Auto</em> — the AI acts freely without interruptions.
              </div>
            </div>
          )}

          {section === "appearance" && (
            <div>
              <h2 className={styles.sectionTitle}>Appearance</h2>
              <p className={styles.sectionDesc}>
                Theme and display settings (coming soon).
              </p>
              <div className={styles.comingSoon}>🎨 More appearance options in a future update.</div>
            </div>
          )}

          {section === "shortcuts" && (
            <div>
              <h2 className={styles.sectionTitle}>Keyboard Shortcuts</h2>
              <table className={styles.shortcutTable}>
                <tbody>
                  {[
                    ["Cmd+T", "New project tab"],
                    ["Cmd+W", "Close project tab"],
                    ["Cmd+1–9", "Switch to tab by number"],
                    ["Cmd+,", "Open Settings"],
                    ["Enter", "Send chat message"],
                    ["Shift+Enter", "New line in chat"],
                  ].map(([key, desc]) => (
                    <tr key={key}>
                      <td className={styles.shortcutKey}>{key}</td>
                      <td className={styles.shortcutDesc}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {section === "about" && (
            <div>
              <h2 className={styles.sectionTitle}>About Wren</h2>
              <p className={styles.sectionDesc}>
                Wren is a lightweight AI-native IDE built on Electron.
              </p>
              <div className={styles.aboutRow}>
                <span className={styles.aboutLabel}>Version</span>
                <span className={styles.aboutValue}>0.1.0</span>
              </div>
              <div className={styles.aboutRow}>
                <span className={styles.aboutLabel}>Providers</span>
                <span className={styles.aboutValue}>{providers.length} configured</span>
              </div>
              <div className={styles.aboutRow}>
                <span className={styles.aboutLabel}>Projects</span>
                <span className={styles.aboutValue}>{projects.length} open</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
