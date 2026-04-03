import { useState, useEffect, useRef, useCallback } from "react";
import { useProjects } from "../store/projectStore";
import { PROVIDER_META } from "../store/providerStore";
import type { ProviderId } from "@wren/shared";
import styles from "./TabBar.module.css";

const PROVIDERS: ProviderId[] = ["anthropic", "openai", "gemini", "ollama"];

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
  const renameInputRef = useRef<HTMLInputElement>(null);

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
    void openProjectFromDisk();
  }, [openProjectFromDisk]);

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

      <button className={styles.addBtn} onClick={handleNewProject} title="New project (Cmd+T)">
        +
      </button>

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
