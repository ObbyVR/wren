import { useState, useEffect, useCallback } from "react";
import { useProviders, PROVIDER_META } from "../../store/providerStore";
import { useProjects } from "../../store/projectStore";
import { useAgentic } from "../../store/agenticStore";
import type { ProviderId, ProviderConfig, ApprovalMode, LicenseStatus, TierLimits } from "@wren/shared";
import styles from "./SettingsPanel.module.css";

type Section = "providers" | "agentic" | "license" | "telemetry" | "appearance" | "shortcuts" | "about" | "help";

const PROVIDERS: ProviderId[] = ["anthropic", "openai", "gemini", "ollama"];

interface Props {
  onClose: () => void;
  onTriggerOnboarding?: () => void;
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

export function SettingsPanel({ onClose, onTriggerOnboarding }: Props) {
  const [section, setSection] = useState<Section>("providers");
  const { providers, getProvider, setProviderKey, removeProviderKey, setProviderStatus } =
    useProviders();
  const { projects, activeProject, setProjectProvider } = useProjects();
  const { settings, updateSettings } = useAgentic();

  // License state
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [licenseLimits, setLicenseLimits] = useState<TierLimits | null>(null);

  // Telemetry state
  const [telemetryOptedIn, setTelemetryOptedIn] = useState(false);

  useEffect(() => {
    void window.wren.invoke("license:get-status").then((s) => {
      setLicenseStatus(s);
    });
    void window.wren.invoke("license:get-limits").then((l) => {
      setLicenseLimits(l);
    });
    void window.wren.invoke("telemetry:get-settings").then((s) => {
      setTelemetryOptedIn(s.optedIn);
    });
  }, []);

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

  const handleLicenseActivate = useCallback(async () => {
    setLicenseError(null);
    const status = await window.wren.invoke("license:activate", { key: licenseKey.trim() });
    setLicenseStatus(status);
    if (status.valid) {
      setLicenseKey("");
      const limits = await window.wren.invoke("license:get-limits");
      setLicenseLimits(limits);
    } else {
      setLicenseError(status.reason ?? "Invalid key");
    }
  }, [licenseKey]);

  const handleLicenseDeactivate = useCallback(async () => {
    await window.wren.invoke("license:deactivate");
    const status = await window.wren.invoke("license:get-status");
    setLicenseStatus(status);
    const limits = await window.wren.invoke("license:get-limits");
    setLicenseLimits(limits);
  }, []);

  const handleTelemetryToggle = useCallback(async (optedIn: boolean) => {
    setTelemetryOptedIn(optedIn);
    await window.wren.invoke("telemetry:set-opted-in", { optedIn });
  }, []);

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
          {(["providers", "agentic", "license", "telemetry", "appearance", "shortcuts", "about", "help"] as Section[]).map((s) => (
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

          {section === "license" && (
            <div>
              <h2 className={styles.sectionTitle}>License</h2>
              <p className={styles.sectionDesc}>
                Activate a Pro or Team license key to unlock unlimited projects and providers.
              </p>

              {licenseStatus && (
                <div className={styles.licenseCard}>
                  <div className={styles.licenseCardRow}>
                    <span className={styles.licenseCardLabel}>Plan</span>
                    <span
                      className={`${styles.tierBadge} ${
                        licenseStatus.tier === "pro"
                          ? styles.tierBadgePro
                          : licenseStatus.tier === "team"
                            ? styles.tierBadgeTeam
                            : styles.tierBadgeFree
                      }`}
                    >
                      {licenseStatus.tier}
                    </span>
                  </div>
                  {licenseStatus.email && (
                    <div className={styles.licenseCardRow}>
                      <span className={styles.licenseCardLabel}>Email</span>
                      <span className={styles.licenseCardValue}>{licenseStatus.email}</span>
                    </div>
                  )}
                  {licenseStatus.expiresAt && (
                    <div className={styles.licenseCardRow}>
                      <span className={styles.licenseCardLabel}>Expires</span>
                      <span className={styles.licenseCardValue}>
                        {new Date(licenseStatus.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {licenseLimits && (
                <div className={styles.limitsList}>
                  <div className={styles.limitsRow}>
                    <span className={licenseLimits.maxProjects === -1 ? styles.limitsCheck : styles.limitsCross}>
                      {licenseLimits.maxProjects === -1 ? "✓" : "✗"}
                    </span>
                    <span className={styles.limitsLabel}>
                      {licenseLimits.maxProjects === -1
                        ? "Unlimited projects"
                        : `Up to ${licenseLimits.maxProjects} project`}
                    </span>
                  </div>
                  <div className={styles.limitsRow}>
                    <span className={licenseLimits.maxProviders === -1 ? styles.limitsCheck : styles.limitsCross}>
                      {licenseLimits.maxProviders === -1 ? "✓" : "✗"}
                    </span>
                    <span className={styles.limitsLabel}>
                      {licenseLimits.maxProviders === -1
                        ? "Unlimited AI providers"
                        : `Up to ${licenseLimits.maxProviders} provider`}
                    </span>
                  </div>
                  <div className={styles.limitsRow}>
                    <span className={licenseLimits.sharedWorkspaces ? styles.limitsCheck : styles.limitsCross}>
                      {licenseLimits.sharedWorkspaces ? "✓" : "✗"}
                    </span>
                    <span className={styles.limitsLabel}>Shared workspaces (Team)</span>
                  </div>
                </div>
              )}

              {licenseStatus?.tier === "free" || !licenseStatus?.valid ? (
                <div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>License key</label>
                    <input
                      className={styles.formInput}
                      type="text"
                      placeholder="xxxx.eyJ0aWVyIjoicHJvIi4uLn0.sig"
                      value={licenseKey}
                      onChange={(e) => setLicenseKey(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleLicenseActivate(); }}
                    />
                  </div>
                  {licenseError && (
                    <p className={styles.licenseError}>{licenseError}</p>
                  )}
                  <div className={styles.providerActions} style={{ marginTop: "8px" }}>
                    <button
                      className={styles.btnPrimary}
                      disabled={!licenseKey.trim()}
                      onClick={() => void handleLicenseActivate()}
                    >
                      Activate
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.providerActions}>
                  <button
                    className={styles.btnDanger}
                    onClick={() => void handleLicenseDeactivate()}
                  >
                    Deactivate license
                  </button>
                </div>
              )}
            </div>
          )}

          {section === "telemetry" && (
            <div>
              <h2 className={styles.sectionTitle}>Telemetry</h2>
              <p className={styles.sectionDesc}>
                Help improve Wren by sharing anonymous usage data. Opt-in is required — nothing is sent without your consent.
              </p>

              <div className={styles.formRow}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={telemetryOptedIn}
                    onChange={(e) => void handleTelemetryToggle(e.target.checked)}
                  />
                  <span className={styles.toggleSlider} />
                  <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#9090b0" }}>
                    Send anonymous usage data
                  </span>
                </label>
              </div>

              <div className={styles.telemetryNote}>
                <strong>What is collected (when opted in):</strong><br />
                <em>app_launched</em> — when Wren starts<br />
                <em>session_duration</em> — how long a session lasts<br />
                <em>provider_used</em> — which AI provider was active (no keys or messages)<br /><br />
                <strong>What is never collected:</strong> source code, file contents, API keys, chat messages, personal identifiers.<br /><br />
                You can change this setting at any time. Default is OFF.
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

          {section === "help" && (
            <div>
              <h2 className={styles.sectionTitle}>Help</h2>
              <p className={styles.sectionDesc}>
                Setup wizard and documentation resources.
              </p>
              <div style={{ marginTop: "1rem" }}>
                <button
                  className={styles.btnPrimary}
                  onClick={() => onTriggerOnboarding?.()}
                >
                  ✦ Restart Setup Wizard
                </button>
                <p className={styles.sectionDesc} style={{ marginTop: "0.75rem" }}>
                  Re-run the onboarding flow to change your theme, API keys, or open a new project.
                </p>
              </div>
              <div className={styles.sectionDesc} style={{ marginTop: "1.5rem" }}>
                <strong>Keyboard shortcuts</strong><br />
                <em>Cmd+,</em> — Open Settings<br />
                <em>Cmd+T</em> — New project tab<br />
                <em>Cmd+W</em> — Close project tab<br />
                <em>✦ Chat</em> — Toggle AI chat panel<br />
                <em>⊞ Hub</em> — Switch to Hub layout<br />
                <em>⎇ Git</em> — Open Git panel<br />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
