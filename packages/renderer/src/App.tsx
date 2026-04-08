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
import { GitPanel } from "./components/GitPanel";
import { OnboardingWizard, isOnboardingDone } from "./components/Onboarding";
import { ProjectProvider, useProjects } from "./store/projectStore";
import { ProviderProvider } from "./store/providerStore";
import { CostProvider } from "./store/costStore";
import { AgenticProvider, useAgentic } from "./store/agenticStore";
import styles from "./App.module.css";
import type { ProjectTab } from "@wren/shared";

const STORAGE_KEY_LAYOUT_H = "wren:layout:horizontal";
const STORAGE_KEY_LAYOUT_V = "wren:layout:vertical";

type SidebarPanel = "git" | "files" | "preview" | null;

function loadLayout(key: string): Layout | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Layout;
  } catch { /* ignore */ }
  return undefined;
}

// ── Per-project workspace ────────────────────────────────────────────────────

interface WorkspaceProps {
  project: ProjectTab;
  visible: boolean;
  sidebarPanel: SidebarPanel;
}

function ProjectWorkspace({ project, visible, sidebarPanel }: WorkspaceProps) {
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
    try {
      const folderPath = await window.wren.invoke("dialog:open-folder");
      if (folderPath) {
        await window.wren.invoke("project:update", { id: project.id });
      }
    } catch {
      const path = window.prompt("Enter folder path:");
      if (path?.trim()) {
        localStorage.setItem("wren:rootPath", path.trim());
      }
    }
  }, [project.id]);

  // Determine what the right panel shows based on sidebarPanel
  const showPreview = sidebarPanel === "preview";
  const showGit = sidebarPanel === "git";

  return (
    <div
      className={styles.workspace}
      style={{ display: visible ? "flex" : "none" }}
    >
      {/* File tree overlay — toggled from status bar */}
      {sidebarPanel === "files" && (
        <div className={styles.fileTreeOverlay}>
          <FileTree
            rootPath={rootPath}
            activePath={activeFilePath}
            onFileOpen={handleFileOpen}
            onOpenFolder={handleOpenFolder}
          />
        </div>
      )}

      <Group
        orientation="horizontal"
        defaultLayout={loadLayout(`${STORAGE_KEY_LAYOUT_H}:${project.id}`)}
        onLayoutChange={(layout: Layout) =>
          localStorage.setItem(`${STORAGE_KEY_LAYOUT_H}:${project.id}`, JSON.stringify(layout))
        }
      >
        {/* LEFT: AI Chat */}
        <Panel defaultSize={30} minSize={1} collapsible>
          <ChatPanel />
        </Panel>

        <Separator className={styles.hHandle} />

        {/* RIGHT: Editor/Preview + Terminal stacked */}
        <Panel defaultSize={showGit ? 48 : 70} minSize={1}>
          <Group
            orientation="vertical"
            defaultLayout={loadLayout(`${STORAGE_KEY_LAYOUT_V}:${project.id}`)}
            onLayoutChange={(layout: Layout) =>
              localStorage.setItem(`${STORAGE_KEY_LAYOUT_V}:${project.id}`, JSON.stringify(layout))
            }
          >
            <Panel defaultSize={75} minSize={1} collapsible>
              {showPreview ? (
                <PreviewPanel />
              ) : (
                <Editor
                  openPath={openFilePath}
                  onPathHandled={handlePathHandled}
                />
              )}
            </Panel>

            <Separator className={styles.vHandle} />

            <Panel defaultSize={25} minSize={1} collapsible>
              <Terminal cwd={termCwd} />
            </Panel>
          </Group>
        </Panel>

        {/* FAR RIGHT: Git panel (optional) */}
        {showGit && (
          <>
            <Separator className={styles.hHandle} />
            <Panel defaultSize={22} minSize={1} collapsible>
              <GitPanel />
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
}

// ── Inner app (has access to context) ────────────────────────────────────────

function AppInner() {
  const { projects, activeProjectId } = useProjects();
  const { agenticEnabled, actionLog } = useAgentic();
  const [showSettings, setShowSettings] = useState(false);
  const [showCostDashboard, setShowCostDashboard] = useState(false);
  const [actionLogOpen, setActionLogOpen] = useState(false);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone());

  const toggleSidebarPanel = useCallback((panel: SidebarPanel) => {
    setSidebarPanel((prev) => (prev === panel ? null : panel));
  }, []);

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
      {/* ── Top: browser-style project tabs (full width) ── */}
      <TabBar />

      {/* ── Middle: toolbar + workspace ── */}
      <div className={styles.mainArea}>
        {/* Left toolbar column */}
        <div className={styles.toolbar}>
          {/* Top: workspace tools */}
          <button
            className={`${styles.toolBtn} ${sidebarPanel === "files" ? styles.toolBtnActive : ""}`}
            onClick={() => toggleSidebarPanel("files")}
            title="File explorer"
          >
            📁
          </button>
          <button
            className={`${styles.toolBtn} ${sidebarPanel === "preview" ? styles.toolBtnActive : ""}`}
            onClick={() => toggleSidebarPanel("preview")}
            title="Browser preview"
          >
            ◉
          </button>
          <button
            className={`${styles.toolBtn} ${sidebarPanel === "git" ? styles.toolBtnActive : ""}`}
            onClick={() => toggleSidebarPanel("git")}
            title="Git panel"
          >
            ⎇
          </button>

          {agenticEnabled && (
            <button
              className={`${styles.toolBtn} ${styles.toolBtnAgent}`}
              onClick={() => setActionLogOpen((v) => !v)}
              title={`Agent · ${actionLog.length} actions`}
            >
              <span className={styles.agenticDot} />
            </button>
          )}

          <span className={styles.toolSpacer} />

          {/* Bottom: settings & billing */}
          <button
            className={styles.toolBtn}
            onClick={() => setShowCostDashboard(true)}
            title="Billing & costs"
          >
            $
          </button>
          <button
            className={styles.toolBtn}
            onClick={() => setShowSettings(true)}
            title="Settings (Cmd+,)"
          >
            ⚙
          </button>
        </div>

        {/* Workspace */}
        <div className={styles.workspaceContainer}>
          {projects.map((project) => (
            <ProjectWorkspace
              key={project.id}
              project={project}
              visible={project.id === activeProjectId}
              sidebarPanel={sidebarPanel}
            />
          ))}
        </div>
      </div>

      {/* Action log panel */}
      <ActionLogPanel isOpen={actionLogOpen} onToggle={() => setActionLogOpen((v) => !v)} />

      {/* ── Modals ── */}
      <ApprovalDialog />
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onTriggerOnboarding={() => { setShowSettings(false); setShowOnboarding(true); }}
        />
      )}
      {showCostDashboard && <CostDashboard onClose={() => setShowCostDashboard(false)} />}
      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}

// ── Root with providers ───────────────────────────────────────────────────────

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
