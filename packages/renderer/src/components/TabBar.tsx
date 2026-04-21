import { useState, useEffect, useRef, useCallback } from "react";
import { useProjects } from "../store/projectStore";
import { PROVIDER_META } from "../store/providerStore";
import type { ProviderId, LicenseStatus, TierLimits } from "@wren/shared";
import styles from "./TabBar.module.css";

const PROVIDERS: ProviderId[] = ["anthropic", "openai", "gemini", "mistral", "ollama"];

interface ContextMenuState {
  projectId: string;
  x: number;
  y: number;
}

interface RenameState {
  projectId: string;
  value: string;
}

export function TabBar() {
  const {
    projects,
    activeProjectId,
    setActiveProject,
    openProjectFromDisk,
    renameProject,
    setProjectProvider,
    closeProject,
  } = useProjects();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [showProviderPicker, setShowProviderPicker] = useState<string | null>(null);
  const [licenseLimits, setLicenseLimits] = useState<TierLimits | null>(null);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [showUpgradeHint, setShowUpgradeHint] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Load license once; refresh on project count change so activation takes effect live
  useEffect(() => {
    void window.wren.invoke("license:get-limits").then(setLicenseLimits).catch(() => {});
    void window.wren.invoke("license:get-status").then(setLicenseStatus).catch(() => {});
  }, [projects.length]);

  const maxProjects = licenseLimits?.maxProjects ?? 1;
  const atProjectLimit = maxProjects > 0 && projects.length >= maxProjects;
  const tierLabel = licenseStatus?.tier ?? "free";

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  // Focus rename input
  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      if (e.key === "t") {
        e.preventDefault();
        handleNewProject();
      } else if (e.key === "w") {
        e.preventDefault();
        closeProject(activeProjectId);
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (projects[idx]) {
          e.preventDefault();
          setActiveProject(projects[idx].id);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, activeProjectId, openProjectFromDisk]);

  const handleNewProject = useCallback(() => {
    if (atProjectLimit) {
      setShowUpgradeHint(true);
      return;
    }
    void openProjectFromDisk();
  }, [openProjectFromDisk, atProjectLimit]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.preventDefault();
      setContextMenu({ projectId, x: e.clientX, y: e.clientY });
      setShowProviderPicker(null);
    },
    [],
  );

  const handleRenameStart = useCallback((projectId: string, currentName: string) => {
    setContextMenu(null);
    setRenaming({ projectId, value: currentName });
  }, []);

  const handleRenameCommit = useCallback(() => {
    if (!renaming) return;
    const trimmed = renaming.value.trim();
    if (trimmed) renameProject(renaming.projectId, trimmed);
    setRenaming(null);
  }, [renaming, renameProject]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleRenameCommit();
      if (e.key === "Escape") setRenaming(null);
    },
    [handleRenameCommit],
  );

  return (
    <div className={styles.root}>
      <div className={styles.tabs}>
        {projects.map((project, idx) => {
          const meta = PROVIDER_META[project.providerId];
          const isActive = project.id === activeProjectId;
          const isRenaming = renaming?.projectId === project.id;

          return (
            <div
              key={project.id}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
              onClick={() => setActiveProject(project.id)}
              onContextMenu={(e) => handleContextMenu(e, project.id)}
              title={`${project.name} — ${meta.name} (Cmd+${idx + 1})`}
            >
              <span className={styles.tabIcon}>◈</span>

              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  className={styles.renameInput}
                  value={renaming.value}
                  onChange={(e) =>
                    setRenaming({ projectId: project.id, value: e.target.value })
                  }
                  onBlur={handleRenameCommit}
                  onKeyDown={handleRenameKeyDown}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className={styles.tabName}>{project.name}</span>
              )}

              <span
                className={styles.providerBadge}
                style={{ background: meta.color + "22", color: meta.color }}
              >
                {meta.name.slice(0, 3)}
              </span>

              {isActive && (
                <span className={styles.statusDot} />
              )}

              {projects.length > 1 && (
                <button
                  className={styles.closeBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeProject(project.id);
                  }}
                  title="Close project (Cmd+W)"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        className={styles.addBtn}
        onClick={handleNewProject}
        title={
          atProjectLimit
            ? `Free tier limit reached (${projects.length}/${maxProjects}) — upgrade to Pro for unlimited projects`
            : "New project (Cmd+T)"
        }
        style={atProjectLimit ? { opacity: 0.55, cursor: "help" } : undefined}
      >
        +
      </button>

      {showUpgradeHint && (
        <div
          style={{
            position: "fixed",
            top: "48px",
            right: "16px",
            background: "#13131f",
            border: "1px solid rgba(52,208,123,0.3)",
            borderRadius: "10px",
            padding: "14px 16px",
            maxWidth: "320px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            zIndex: 200,
            fontSize: "12px",
            color: "#e4e4f0",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ fontWeight: 600, marginBottom: "6px", color: "#34d07b" }}>
            Project limit reached ({tierLabel} tier)
          </div>
          <div style={{ color: "#9090b0", marginBottom: "10px", lineHeight: 1.5 }}>
            The {tierLabel} tier allows {maxProjects} project{maxProjects === 1 ? "" : "s"} at a time.
            Close a project, or upgrade to Pro for unlimited projects.
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              style={{
                background: "#34d07b",
                color: "#0a0a12",
                border: "none",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => {
                setShowUpgradeHint(false);
                window.dispatchEvent(new CustomEvent("wren:open-settings", { detail: { section: "license" } }));
              }}
            >
              Open License settings
            </button>
            <button
              style={{
                background: "transparent",
                color: "#9090b0",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "11px",
                cursor: "pointer",
              }}
              onClick={() => setShowUpgradeHint(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className={styles.menuItem}
            onClick={() => {
              const project = projects.find((p) => p.id === contextMenu.projectId);
              if (project) handleRenameStart(project.id, project.name);
            }}
          >
            Rename
          </button>
          <button
            className={styles.menuItem}
            onClick={() => setShowProviderPicker(contextMenu.projectId)}
          >
            Change provider ▶
          </button>
          {projects.length > 1 && (
            <button
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={() => {
                closeProject(contextMenu.projectId);
                setContextMenu(null);
              }}
            >
              Close
            </button>
          )}
        </div>
      )}

      {/* Provider picker sub-menu */}
      {showProviderPicker && contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x + 140 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {PROVIDERS.map((pid) => {
            const meta = PROVIDER_META[pid];
            return (
              <button
                key={pid}
                className={styles.menuItem}
                onClick={() => {
                  setProjectProvider(showProviderPicker, pid);
                  setShowProviderPicker(null);
                  setContextMenu(null);
                }}
              >
                <span
                  className={styles.menuProviderDot}
                  style={{ background: meta.color }}
                />
                {meta.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
