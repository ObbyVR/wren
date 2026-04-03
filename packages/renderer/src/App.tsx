import { useState, useCallback, useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { Layout } from "react-resizable-panels";
import { FileTree } from "./components/FileTree";
import { Editor } from "./components/Editor";
import { Terminal } from "./components/Terminal";
import { ChatPanel } from "./components/ChatPanel";
import { TabBar } from "./components/TabBar";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { CostDashboard } from "./components/CostDashboard/CostDashboard";
import { PreviewPanel } from "./components/PreviewPanel";
import { ApprovalDialog, ActionLogPanel } from "./components/Agentic";
import { ProjectProvider, useProjects } from "./store/projectStore";
import { ProviderProvider } from "./store/providerStore";
import { CostProvider } from "./store/costStore";
import { AgenticProvider, useAgentic } from "./store/agenticStore";
import styles from "./App.module.css";
import type { ProjectTab } from "@wren/shared";

const STORAGE_KEY_LAYOUT_H = "wren:layout:horizontal";
const STORAGE_KEY_LAYOUT_V = "wren:layout:vertical";

function loadLayout(key: string): Layout | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Layout;
  } catch { /* ignore */ }
  return undefined;
}

// ── Per-project workspace (keeps state alive while hidden) ───────────────────

interface WorkspaceProps {
  project: ProjectTab;
  visible: boolean;
  chatOpen: boolean;
  previewOpen: boolean;
}

function ProjectWorkspace({ project, visible, chatOpen, previewOpen }: WorkspaceProps) {
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const rootPath = project.rootPath ?? null;
  const termCwd = rootPath ?? "/";

  const handleFileOpen = useCallback((path: string) => {
    setOpenFilePath(path);
    setActiveFilePath(path);
  }, []);

  const handlePathHandled = useCallback(() => {
    setOpenFilePath(null);
  }, []);

  const handleOpenFolder = useCallback(async () => {
    // Per-project folder change — use dialog IPC if available
    try {
      const folderPath = await window.wren.invoke("dialog:open-folder");
      if (folderPath) {
        // Persist updated rootPath via IPC and reload project info
        await window.wren.invoke("project:update", { id: project.id });
      }
    } catch {
      const path = window.prompt("Enter folder path:");
      if (path?.trim()) {
        localStorage.setItem("wren:rootPath", path.trim());
      }
    }
  }, [project.id]);

  return (
    <div
      className={styles.workspace}
      style={{ display: visible ? "flex" : "none" }}
    >
      <Group
        orientation="horizontal"
        defaultLayout={loadLayout(`${STORAGE_KEY_LAYOUT_H}:${project.id}`)}
        onLayoutChange={(layout: Layout) =>
          localStorage.setItem(`${STORAGE_KEY_LAYOUT_H}:${project.id}`, JSON.stringify(layout))
        }
      >
        {/* Left: File Tree */}
        <Panel defaultSize={18} minSize={10} maxSize={35}>
          <FileTree
            rootPath={rootPath}
            activePath={activeFilePath}
            onFileOpen={handleFileOpen}
            onOpenFolder={handleOpenFolder}
          />
        </Panel>

        <Separator className={styles.hHandle} />

        {/* Center: Editor + Terminal stacked vertically */}
        <Panel defaultSize={chatOpen || previewOpen ? 54 : 82} minSize={30}>
          <Group
            orientation="vertical"
            defaultLayout={loadLayout(`${STORAGE_KEY_LAYOUT_V}:${project.id}`)}
            onLayoutChange={(layout: Layout) =>
              localStorage.setItem(`${STORAGE_KEY_LAYOUT_V}:${project.id}`, JSON.stringify(layout))
            }
          >
            <Panel defaultSize={70} minSize={20}>
              <Editor
                openPath={openFilePath}
                onPathHandled={handlePathHandled}
              />
            </Panel>

            <Separator className={styles.vHandle} />

            <Panel defaultSize={30} minSize={15} maxSize={60}>
              <Terminal cwd={termCwd} />
            </Panel>
          </Group>
        </Panel>

        {chatOpen && (
          <>
            <Separator className={styles.hHandle} />
            <Panel defaultSize={previewOpen ? 14 : 28} minSize={14} maxSize={50}>
              <ChatPanel />
            </Panel>
          </>
        )}

        {previewOpen && (
          <>
            <Separator className={styles.hHandle} />
            <Panel defaultSize={chatOpen ? 14 : 28} minSize={14} maxSize={50}>
              <PreviewPanel />
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
}

// ── Inner app (has access to context) ───────────────────────────────────────

function AppInner() {
  const { projects, activeProjectId } = useProjects();
  const { agenticEnabled, actionLog } = useAgentic();
  const [chatOpen, setChatOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCostDashboard, setShowCostDashboard] = useState(false);
  const [actionLogOpen, setActionLogOpen] = useState(false);

  // Keyboard shortcut: Cmd+, for Settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === ",") {
        e.preventDefault();
        setShowSettings((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className={styles.shell}>
      {/* Tab bar at the top */}
      <TabBar />

      {/* Per-project workspaces — all mounted, only active visible */}
      {projects.map((project) => (
        <ProjectWorkspace
          key={project.id}
          project={project}
          visible={project.id === activeProjectId}
          chatOpen={chatOpen}
          previewOpen={previewOpen}
        />
      ))}

      {/* Action log panel — collapsible strip above the status bar */}
      <ActionLogPanel isOpen={actionLogOpen} onToggle={() => setActionLogOpen((v) => !v)} />

      {/* Bottom action bar */}
      <div className={styles.statusBar}>
        <button
          className={styles.statusBtn}
          onClick={() => setShowSettings(true)}
          title="Settings (Cmd+,)"
        >
          ⚙ Settings
        </button>
        <button
          className={styles.statusBtn}
          onClick={() => setShowCostDashboard(true)}
          title="Cost dashboard"
        >
          $ Cost
        </button>
        <span className={styles.statusSpacer} />
        {/* Agentic mode indicator in status bar */}
        {agenticEnabled && (
          <span
            className={styles.agenticIndicator}
            title={`Agentic mode active · ${actionLog.length} actions`}
            onClick={() => setActionLogOpen((v) => !v)}
          >
            <span className={styles.agenticIndicatorDot} />
            Agent{actionLog.length > 0 ? ` · ${actionLog.length}` : ""}
          </span>
        )}
        <button
          className={styles.statusBtn}
          onClick={() => setPreviewOpen((v) => !v)}
          title={previewOpen ? "Hide browser preview" : "Show browser preview (Nexus Bridge)"}
        >
          {previewOpen ? "✕ Preview" : "◉ Preview"}
        </button>
        <button
          className={styles.chatToggleBtn}
          onClick={() => setChatOpen((v) => !v)}
          title={chatOpen ? "Hide AI chat" : "Show AI chat"}
        >
          {chatOpen ? "✕ Chat" : "✦ Chat"}
        </button>
      </div>

      {/* Approval dialog — floats above everything */}
      <ApprovalDialog />

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showCostDashboard && <CostDashboard onClose={() => setShowCostDashboard(false)} />}
    </div>
  );
}

// ── Root with providers ──────────────────────────────────────────────────────

export default function App() {
  return (
    <ProjectProvider>
      <ProviderProvider>
        <CostProvider>
          <AgenticProvider>
            <AppInner />
          </AgenticProvider>
        </CostProvider>
      </ProviderProvider>
    </ProjectProvider>
  );
}
