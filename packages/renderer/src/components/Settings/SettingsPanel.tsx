import { useState, useEffect, useCallback } from "react";
import { useProviders, PROVIDER_META } from "../../store/providerStore";
import { useProjects } from "../../store/projectStore";
import { useAgentic } from "../../store/agenticStore";
import { usePromptLibrary } from "../../store/promptLibraryStore";
import type { ProviderId, ProviderConfig, ApprovalMode, LicenseStatus, TierLimits, CredentialEntry, AgenticSnapshot, AuditEntry } from "@wren/shared";
import styles from "./SettingsPanel.module.css";

type Section = "providers" | "vault" | "agentic" | "snapshots" | "audit" | "bridge" | "prompts" | "license" | "telemetry" | "appearance" | "shortcuts" | "about" | "help";

const PROVIDERS: ProviderId[] = ["anthropic", "openai", "gemini", "mistral", "ollama"];

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
  const { snippets, addSnippet, updateSnippet, deleteSnippet } = usePromptLibrary();
  const [promptDraftTitle, setPromptDraftTitle] = useState("");
  const [promptDraftBody, setPromptDraftBody] = useState("");
  const [promptDraftGlobal, setPromptDraftGlobal] = useState(true);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);

  // License state
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [licenseLimits, setLicenseLimits] = useState<TierLimits | null>(null);

  // Telemetry state
  const [telemetryOptedIn, setTelemetryOptedIn] = useState(false);

  // Snapshot history state
  const [snapshots, setSnapshots] = useState<AgenticSnapshot[]>([]);

  // Audit log state
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  // Vault state
  const [credentials, setCredentials] = useState<CredentialEntry[]>([]);
  const [vaultAdding, setVaultAdding] = useState(false);
  const [vaultProvider, setVaultProvider] = useState<string>("anthropic");
  const [vaultAlias, setVaultAlias] = useState("default");
  const [vaultKey, setVaultKey] = useState("");
  const [vaultLabel, setVaultLabel] = useState("");
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");

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
    void window.wren.invoke("credentials:list").then(setCredentials);
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

  const refreshCredentials = useCallback(() => {
    void window.wren.invoke("credentials:list").then(setCredentials);
  }, []);

  const handleVaultAdd = useCallback(async () => {
    setVaultError(null);
    const result = await window.wren.invoke("credentials:set", {
      providerId: vaultProvider,
      alias: vaultAlias.trim() || "default",
      key: vaultKey.trim(),
      label: vaultLabel.trim() || undefined,
    });
    if (result.valid) {
      setVaultAdding(false);
      setVaultKey("");
      setVaultLabel("");
      setVaultAlias("default");
      refreshCredentials();
    } else {
      setVaultError(result.error ?? "Invalid key");
    }
  }, [vaultProvider, vaultAlias, vaultKey, vaultLabel, refreshCredentials]);

  const handleVaultRemove = useCallback(async (providerId: string, alias: string) => {
    await window.wren.invoke("credentials:remove", { providerId, alias });
    refreshCredentials();
  }, [refreshCredentials]);

  const handleVaultLabelSave = useCallback(async (providerId: string, alias: string, label: string) => {
    await window.wren.invoke("credentials:set-meta", { providerId, alias, label });
    setEditingLabel(null);
    refreshCredentials();
  }, [refreshCredentials]);

  // ── .env import ────────────────────────────────────────────────────────────
  const [envImportReport, setEnvImportReport] = useState<string | null>(null);

  const handleEnvImport = useCallback(async () => {
    setEnvImportReport(null);
    const res = await window.wren.invoke("dialog:open-env-file");
    if (!res) return; // cancelled
    if (res.error) {
      setEnvImportReport(`Error reading file: ${res.error}`);
      return;
    }

    // Map env var name → providerId (and alias if "_<LABEL>" suffix)
    const ENV_MAP: Record<string, ProviderId> = {
      ANTHROPIC_API_KEY: "anthropic",
      CLAUDE_API_KEY: "anthropic",
      OPENAI_API_KEY: "openai",
      OPENAI_KEY: "openai",
      GEMINI_API_KEY: "gemini",
      GOOGLE_API_KEY: "gemini",
      GOOGLE_GENERATIVE_AI_API_KEY: "gemini",
      MISTRAL_API_KEY: "mistral",
      MISTRAL_KEY: "mistral",
    };

    const found: Array<{ name: string; providerId: ProviderId; value: string }> = [];
    for (const rawLine of res.content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const m = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const [, name, rawValue] = m;
      if (!ENV_MAP[name]) continue;
      const value = rawValue.replace(/^['"]|['"]$/g, "").trim();
      if (!value) continue;
      found.push({ name, providerId: ENV_MAP[name], value });
    }

    if (found.length === 0) {
      setEnvImportReport("No recognised API keys found. Expected one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY.");
      return;
    }

    let imported = 0;
    let failed = 0;
    for (const entry of found) {
      try {
        const result = await window.wren.invoke("credentials:set", {
          providerId: entry.providerId,
          alias: "default",
          key: entry.value,
          label: `imported from ${res.path.split("/").pop() ?? ".env"}`,
        });
        if (result.valid) imported++;
        else failed++;
      } catch {
        failed++;
      }
    }
    refreshCredentials();
    setEnvImportReport(
      `Imported ${imported}/${found.length} key${found.length === 1 ? "" : "s"}` +
      (failed > 0 ? ` (${failed} failed validation)` : "")
    );
  }, [refreshCredentials]);

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
          {(["providers", "vault", "agentic", "snapshots", "audit", "bridge", "prompts", "license", "telemetry", "appearance", "shortcuts", "about", "help"] as Section[]).map((s) => (
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

              <div style={{ marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <button className={styles.btnSecondary} onClick={handleEnvImport}>
                  Import from .env file…
                </button>
                <span style={{ color: "#7a7a92", fontSize: "11px" }}>
                  Auto-detects ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY
                </span>
              </div>
              {envImportReport && (
                <div style={{ marginBottom: "14px", padding: "10px 12px", borderRadius: "8px", background: "rgba(52,208,123,0.08)", border: "1px solid rgba(52,208,123,0.25)", color: "#c0c0d0", fontSize: "12px" }}>
                  {envImportReport}
                </div>
              )}

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

          {section === "vault" && (
            <div>
              <h2 className={styles.sectionTitle}>Credential Vault</h2>
              <p className={styles.sectionDesc}>
                All stored API keys across providers. Keys are encrypted with your OS keychain.
              </p>

              {credentials.length === 0 && !vaultAdding && (
                <p className={styles.sectionDesc} style={{ fontStyle: "italic" }}>
                  No credentials stored yet. Add one below.
                </p>
              )}

              {credentials.length > 0 && (
                <table className={styles.shortcutTable} style={{ marginBottom: "1rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: "#9090b0", fontSize: "0.7rem" }}>Provider</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: "#9090b0", fontSize: "0.7rem" }}>Alias</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: "#9090b0", fontSize: "0.7rem" }}>Label</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: "#9090b0", fontSize: "0.7rem" }}>Key</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: "#9090b0", fontSize: "0.7rem" }}>Created</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: "#9090b0", fontSize: "0.7rem" }}>Last used</th>
                      <th style={{ padding: "4px 8px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials.map((c) => {
                      const metaId = `${c.providerId}:${c.alias}`;
                      const isEditing = editingLabel === metaId;
                      return (
                        <tr key={metaId}>
                          <td className={styles.shortcutKey}>
                            <span className={styles.providerDot} style={{ background: PROVIDER_META[c.providerId as ProviderId]?.color ?? "#888" }} />
                            {PROVIDER_META[c.providerId as ProviderId]?.name ?? c.providerId}
                          </td>
                          <td className={styles.shortcutDesc}>{c.alias}</td>
                          <td className={styles.shortcutDesc}>
                            {isEditing ? (
                              <input
                                className={styles.formInput}
                                style={{ width: "100px", padding: "2px 4px", fontSize: "0.75rem" }}
                                value={editLabelValue}
                                onChange={(e) => setEditLabelValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void handleVaultLabelSave(c.providerId, c.alias, editLabelValue);
                                  if (e.key === "Escape") setEditingLabel(null);
                                }}
                                autoFocus
                              />
                            ) : (
                              <span
                                style={{ cursor: "pointer", borderBottom: "1px dashed #555" }}
                                onClick={() => { setEditingLabel(metaId); setEditLabelValue(c.label ?? ""); }}
                                title="Click to edit label"
                              >
                                {c.label || "—"}
                              </span>
                            )}
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "#9090b0", padding: "4px 8px" }}>
                            {c.keyMasked}
                          </td>
                          <td className={styles.shortcutDesc} style={{ fontSize: "0.65rem" }}>
                            {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
                          </td>
                          <td className={styles.shortcutDesc} style={{ fontSize: "0.65rem" }}>
                            {c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleDateString() : "—"}
                          </td>
                          <td>
                            <button
                              className={styles.btnDanger}
                              style={{ padding: "2px 6px", fontSize: "0.65rem" }}
                              onClick={() => void handleVaultRemove(c.providerId, c.alias)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {vaultAdding ? (
                <div style={{ border: "1px solid #333", borderRadius: "6px", padding: "12px", marginTop: "8px" }}>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Provider</label>
                    <select className={styles.formSelect} value={vaultProvider} onChange={(e) => setVaultProvider(e.target.value)}>
                      {PROVIDERS.map((pid) => (
                        <option key={pid} value={pid === "anthropic" ? "claude" : pid}>{PROVIDER_META[pid].name}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Alias</label>
                    <input className={styles.formInput} placeholder="default" value={vaultAlias} onChange={(e) => setVaultAlias(e.target.value)} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>API key</label>
                    <input className={styles.formInput} type="password" placeholder="sk-..." value={vaultKey} onChange={(e) => setVaultKey(e.target.value)} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel}>Label (optional)</label>
                    <input className={styles.formInput} placeholder="e.g. Production" value={vaultLabel} onChange={(e) => setVaultLabel(e.target.value)} />
                  </div>
                  {vaultError && <p style={{ color: "#e05c5c", fontSize: "0.75rem", margin: "4px 0" }}>{vaultError}</p>}
                  <div className={styles.providerActions}>
                    <button className={styles.btnSecondary} onClick={() => { setVaultAdding(false); setVaultError(null); }}>Cancel</button>
                    <button className={styles.btnPrimary} disabled={!vaultKey.trim()} onClick={() => void handleVaultAdd()}>Save & Validate</button>
                  </div>
                </div>
              ) : (
                <button className={styles.btnPrimary} onClick={() => setVaultAdding(true)} style={{ marginTop: "8px" }}>
                  + Add Key
                </button>
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

          {section === "snapshots" && (
            <div>
              <h2 className={styles.sectionTitle}>Snapshot History</h2>
              <p className={styles.sectionDesc}>
                Every agentic write/delete creates a snapshot. Pro-tier retention: 30 days.
                Snapshots are stored locally at <code>~/Library/Application Support/Wren/wren-snapshots/</code>.
              </p>
              <button
                className={styles.btnPrimary}
                style={{ marginBottom: "1rem" }}
                onClick={() => {
                  if (!activeProject) return;
                  void window.wren
                    .invoke("agentic:list-snapshots", { projectId: activeProject.id })
                    .then(setSnapshots)
                    .catch(() => setSnapshots([]));
                }}
              >
                {activeProject ? "Refresh" : "Open a project first"}
              </button>
              {snapshots.length === 0 ? (
                <p className={styles.sectionDesc}><em>No snapshots captured yet for this project.</em></p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "420px", overflowY: "auto" }}>
                  {[...snapshots].reverse().map((snap) => (
                    <div
                      key={snap.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    >
                      <span style={{
                        fontFamily: "monospace",
                        color: snap.type === "deleteFile" ? "#e05c5c" : "#34d07b",
                        minWidth: "70px",
                      }}>
                        {snap.type === "deleteFile" ? "delete" : "write"}
                      </span>
                      <span style={{ flex: 1, fontFamily: "monospace", color: "#c0c0d0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {snap.path}
                      </span>
                      <span style={{ color: "#6a6a80", fontFamily: "monospace" }}>
                        {new Date(snap.timestamp).toLocaleString()}
                      </span>
                      <button
                        className={styles.btnSecondary}
                        onClick={() => {
                          if (!activeProject) return;
                          void window.wren
                            .invoke("agentic:rollbackTo", { projectId: activeProject.id, snapshotId: snap.id })
                            .then(() => window.wren.invoke("agentic:list-snapshots", { projectId: activeProject.id }))
                            .then(setSnapshots)
                            .catch(() => {});
                        }}
                      >
                        Rollback to here
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === "audit" && (
            <div>
              <h2 className={styles.sectionTitle}>Audit Log</h2>
              <p className={styles.sectionDesc}>
                Append-only record of security-relevant events (key changes, snapshot rollbacks).
                Stored locally at <code>~/Library/Application Support/Wren/wren-audit.log</code>.
                Rotation at 5 MB, 90-day retention.
              </p>
              <button
                className={styles.btnPrimary}
                style={{ marginBottom: "1rem" }}
                onClick={() => {
                  void window.wren
                    .invoke("audit:tail", { limit: 200 })
                    .then(setAuditEntries)
                    .catch(() => setAuditEntries([]));
                }}
              >
                Load latest 200 entries
              </button>
              {auditEntries.length === 0 ? (
                <p className={styles.sectionDesc}><em>Click the button above to load the tail.</em></p>
              ) : (
                <div style={{
                  maxHeight: "480px",
                  overflowY: "auto",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  background: "#08080f",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                }}>
                  {[...auditEntries].reverse().map((e, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", padding: "3px 0", color: "#9aa0b8" }}>
                      <span style={{ color: "#6a6a80", minWidth: "170px" }}>{e.timestamp}</span>
                      <span style={{ color: "#34d07b", minWidth: "160px" }}>{e.event}</span>
                      <span style={{ flex: 1, wordBreak: "break-all" }}>
                        {Object.entries(e)
                          .filter(([k]) => k !== "timestamp" && k !== "event")
                          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                          .join(" ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === "prompts" && (
            <div>
              <h2 className={styles.sectionTitle}>Prompt Library</h2>
              <p className={styles.sectionDesc}>
                Save reusable prompts — system instructions, rubrics, templates.
                Global prompts appear in every project; project-scoped ones only in the active one.
              </p>

              <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "14px", marginBottom: "18px", background: "rgba(255,255,255,0.02)" }}>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Title</label>
                  <input
                    className={styles.formInput}
                    value={promptDraftTitle}
                    onChange={(e) => setPromptDraftTitle(e.target.value)}
                    placeholder="e.g. Strict code review"
                  />
                </div>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Prompt</label>
                  <textarea
                    className={styles.formInput}
                    rows={5}
                    value={promptDraftBody}
                    onChange={(e) => setPromptDraftBody(e.target.value)}
                    placeholder="Write the reusable prompt body…"
                    style={{ fontFamily: "monospace", fontSize: "12px", resize: "vertical" }}
                  />
                </div>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Scope</label>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={promptDraftGlobal}
                      onChange={(e) => setPromptDraftGlobal(e.target.checked)}
                    />
                    <span className={styles.toggleSlider} />
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#9090b0" }}>
                      {promptDraftGlobal
                        ? "Global — available everywhere"
                        : activeProject
                          ? `Only for ${activeProject.name}`
                          : "Open a project first to scope"}
                    </span>
                  </label>
                </div>
                <button
                  className={styles.btnPrimary}
                  disabled={!promptDraftTitle.trim() || !promptDraftBody.trim()}
                  onClick={() => {
                    if (editingPromptId) {
                      updateSnippet(editingPromptId, {
                        title: promptDraftTitle.trim(),
                        body: promptDraftBody,
                        projectId: promptDraftGlobal ? undefined : activeProject?.id,
                      });
                    } else {
                      addSnippet({
                        title: promptDraftTitle.trim(),
                        body: promptDraftBody,
                        projectId: promptDraftGlobal ? undefined : activeProject?.id,
                      });
                    }
                    setPromptDraftTitle("");
                    setPromptDraftBody("");
                    setEditingPromptId(null);
                  }}
                >
                  {editingPromptId ? "Update" : "Save prompt"}
                </button>
                {editingPromptId && (
                  <button
                    className={styles.btnSecondary}
                    style={{ marginLeft: "8px" }}
                    onClick={() => {
                      setEditingPromptId(null);
                      setPromptDraftTitle("");
                      setPromptDraftBody("");
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>

              {snippets.length === 0 ? (
                <p className={styles.sectionDesc}><em>No prompts saved yet.</em></p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {snippets.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "8px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <strong style={{ flex: 1 }}>{s.title}</strong>
                        <span style={{
                          fontSize: "10px",
                          fontFamily: "monospace",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: s.projectId ? "rgba(66,133,244,0.12)" : "rgba(52,208,123,0.12)",
                          color: s.projectId ? "#7aa9f7" : "#34d07b",
                        }}>
                          {s.projectId ? "project" : "global"}
                        </span>
                        <button
                          className={styles.btnSecondary}
                          onClick={() => {
                            void navigator.clipboard.writeText(s.body);
                          }}
                        >
                          Copy
                        </button>
                        <button
                          className={styles.btnSecondary}
                          onClick={() => {
                            setEditingPromptId(s.id);
                            setPromptDraftTitle(s.title);
                            setPromptDraftBody(s.body);
                            setPromptDraftGlobal(!s.projectId);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className={styles.btnDanger}
                          onClick={() => deleteSnippet(s.id)}
                        >
                          Delete
                        </button>
                      </div>
                      <pre style={{
                        fontFamily: "monospace",
                        fontSize: "11px",
                        color: "#9090b0",
                        whiteSpace: "pre-wrap",
                        margin: 0,
                        maxHeight: "140px",
                        overflowY: "auto",
                      }}>
                        {s.body}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === "bridge" && (
            <div>
              <h2 className={styles.sectionTitle}>Browser Bridge</h2>
              <p className={styles.sectionDesc}>
                The Browser Bridge is a companion Chrome / Firefox extension that lets Wren
                read the DOM, click elements, and reload pages in a real browser window —
                great for live-preview and UI-debugging loops.
              </p>

              <div style={{
                background: "rgba(52,208,123,0.06)",
                border: "1px solid rgba(52,208,123,0.2)",
                borderRadius: "8px",
                padding: "14px",
                marginBottom: "14px",
                fontSize: "12px",
                color: "#c0c0d0",
              }}>
                <strong style={{ color: "#34d07b" }}>To install</strong>
                <ol style={{ paddingLeft: "20px", margin: "8px 0 0" }}>
                  <li>Download the extension zip from the <a href="https://github.com/ObbyVR/wren/releases/latest" style={{ color: "#34d07b" }}>latest GitHub release</a>.</li>
                  <li>Open <code>chrome://extensions</code> (or <code>about:debugging</code> in Firefox).</li>
                  <li>Enable <strong>Developer mode</strong>.</li>
                  <li>Drop the zip onto the extensions page (or click "Load unpacked" after extracting).</li>
                  <li>Wren will auto-connect via WebSocket on <code>ws://localhost:7331</code>.</li>
                </ol>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <a
                  className={styles.btnPrimary}
                  href="https://github.com/ObbyVR/wren/releases/latest/download/wren-nexus-bridge-0.1.0.zip"
                  style={{ textDecoration: "none" }}
                >
                  Download Chrome zip
                </a>
                <a
                  className={styles.btnSecondary}
                  href="https://github.com/ObbyVR/wren/releases/latest/download/wren-nexus-bridge-0.1.0-firefox.zip"
                  style={{ textDecoration: "none" }}
                >
                  Download Firefox zip
                </a>
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
