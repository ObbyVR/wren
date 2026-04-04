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
const STORAGE_KEY_LAYOUT_MODE = "wren:layout:mode";

type LayoutMode = "classic" | "hub";
type SidebarPanel = "git" | null;

function loadLayout(key: string): Layout | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Layout;
  } catch { /* ignore */ }
  return undefined;
}

function loadLayoutMode(): LayoutMode {
  const raw = localStorage.getItem(STORAGE_KEY_LAYOUT_MODE);
  return raw === "hub" ? "hub" : "classic";
}

// ── Per-project workspace — Classic Layout ────────────────────────────────────

interface WorkspaceProps {
  project: ProjectTab;
  visible: boolean;
  chatOpen: boolean;
  previewOpen: boolean;
  sidebarPanel: SidebarPanel;
}

function ProjectWorkspace({ project, visible, chatOpen, previewOpen, sidebarPanel }: WorkspaceProps) {
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
        <Panel defaultSize={chatOpen || previewOpen || sidebarPanel ? 54 : 82} minSize={30}>
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

        {sidebarPanel === "git" && (
          <>
            <Separator className={styles.hHandle} />
            <Panel defaultSize={22} minSize={16} maxSize={45}>
              <GitPanel />
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
}

// ── Hub Layout ────────────────────────────────────────────────────────────────
// Large central preview, with chats for active project arranged in side panels.

function HubLayout({ chatOpen }: { chatOpen: boolean }) {
  const { projects, activeProjectId } = useProjects();

  // In Hub mode: PreviewPanel is center + large; chats surround it.
  // Left panel: file tree of active project; right panels: preview + optional chat.
  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div className={styles.workspace} style={{ display: "flex" }}>
      <Group orientation="horizontal">
        {/* Left: active project chat */}
        {chatOpen && (
          <>
            <Panel defaultSize={22} minSize={14} maxSize={35}>
              <div className={styles.hubChatColumn}>
                <div className={styles.hubProjectLabel}>
                  {activeProject?.name ?? "Project"}
                </div>
                <ChatPanel />
              </div>
            </Panel>
            <Separator className={styles.hHandle} />
          </>
        )}

        {/* Center: large preview */}
        <Panel defaultSize={chatOpen ? 56 : 78} minSize={40}>
          <div className={styles.hubCenterColumn}>
            <PreviewPanel />
          </div>
        </Panel>

        {/* Right: other projects chats (up to 2 more) */}
        {projects
          .filter((p) => p.id !== activeProjectId)
          .slice(0, 2)
          .map((project) => (
            <div key={project.id} style={{ display: "contents" }}>
              <Separator className={styles.hHandle} />
              <Panel defaultSize={11} minSize={10} maxSize={20}>
                <div className={styles.hubChatColumn}>
                  <div className={styles.hubProjectLabel}>{project.name}</div>
                  <ChatPanel />
                </div>
              </Panel>
            </div>
          ))}
      </Group>
    </div>
  );
}

// ── Inner app (has access to context) ────────────────────────────────────────

function AppInner() {
  const { projects, activeProjectId } = useProjects();
  const { agenticEnabled, actionLog } = useAgentic();
  const [chatOpen, setChatOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCostDashboard, setShowCostDashboard] = useState(false);
  const [actionLogOpen, setActionLogOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(loadLayoutMode);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone());

  const toggleLayoutMode = useCallback(() => {
    setLayoutMode((m) => {
      const next: LayoutMode = m === "classic" ? "hub" : "classic";
      localStorage.setItem(STORAGE_KEY_LAYOUT_MODE, next);
      return next;
    });
  }, []);

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
      {/* Tab bar at the top */}
      <TabBar />

      {/* Workspaces */}
      {layoutMode === "classic" ? (
        projects.map((project) => (
          <ProjectWorkspace
            key={project.id}
            project={project}
            visible={project.id === activeProjectId}
            chatOpen={chatOpen}
            previewOpen={previewOpen}
            sidebarPanel={sidebarPanel}
          />
        ))
      ) : (
        <HubLayout chatOpen={chatOpen} />
      )}

      {/* Action log panel */}
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

        {/* Git panel toggle */}
        <button
          className={`${styles.statusBtn} ${sidebarPanel === "git" ? styles.statusBtnActive : ""}`}
          onClick={() => toggleSidebarPanel("git")}
          title="Git panel"
        >
          ⎇ Git
        </button>

        {/* Layout mode toggle (only in classic mode) */}
        {layoutMode === "classic" && (
          <button
            className={styles.statusBtn}
            onClick={toggleLayoutMode}
            title="Switch to Hub layout — large preview with project chats around it"
          >
            ⊞ Hub
          </button>
        )}
        {layoutMode === "hub" && (
          <button
            className={`${styles.statusBtn} ${styles.statusBtnActive}`}
            onClick={toggleLayoutMode}
            title="Switch to Classic layout"
          >
            ⊟ Classic
          </button>
        )}

        <span className={styles.statusSpacer} />

        {/* Agentic mode indicator */}
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

        {layoutMode === "classic" && (
          <button
            className={styles.statusBtn}
            onClick={() => setPreviewOpen((v) => !v)}
            title={previewOpen ? "Hide browser preview" : "Show browser preview (Nexus Bridge)"}
          >
            {previewOpen ? "✕ Preview" : "◉ Preview"}
          </button>
        )}
        <button
          className={styles.chatToggleBtn}
          onClick={() => setChatOpen((v) => !v)}
          title={chatOpen ? "Hide AI chat" : "Show AI chat"}
        >
          {chatOpen ? "✕ Chat" : "✦ Chat"}
        </button>
      </div>

      {/* Approval dialog */}
      <ApprovalDialog />

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onTriggerOnboarding={() => { setShowSettings(false); setShowOnboarding(true); }}
        />
      )}
      {showCostDashboard && <CostDashboard onClose={() => setShowCostDashboard(false)} />}

      {/* Onboarding wizard */}
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
