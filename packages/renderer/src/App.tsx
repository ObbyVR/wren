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
import { ProjectProvider, useProjects } from "./store/projectStore";
import { ProviderProvider } from "./store/providerStore";
import { CostProvider } from "./store/costStore";
import styles from "./App.module.css";

const STORAGE_KEY_LAYOUT_H = "wren:layout:horizontal";
const STORAGE_KEY_LAYOUT_V = "wren:layout:vertical";

function loadLayout(key: string): Layout | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Layout;
  } catch { /* ignore */ }
  return undefined;
}

// ── Inner app (has access to context) ───────────────────────────────────────

function AppInner() {
  const { activeProject, renameProject } = useProjects();
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCostDashboard, setShowCostDashboard] = useState(false);

  const rootPath = activeProject?.rootPath ?? null;
  const termCwd = rootPath ?? "/";

  const handleFileOpen = useCallback((path: string) => {
    setOpenFilePath(path);
    setActiveFilePath(path);
  }, []);

  const handlePathHandled = useCallback(() => {
    setOpenFilePath(null);
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const path = window.prompt("Enter folder path:");
    if (path && path.trim() && activeProject) {
      const trimmed = path.trim();
      renameProject(activeProject.id, activeProject.name); // keep name, just update path
      // Update rootPath on the active project
      localStorage.setItem("wren:rootPath", trimmed);
      window.location.reload(); // simplest approach for now
    }
  }, [activeProject, renameProject]);

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

      <Group
        orientation="horizontal"
        defaultLayout={loadLayout(STORAGE_KEY_LAYOUT_H)}
        onLayoutChange={(layout: Layout) =>
          localStorage.setItem(STORAGE_KEY_LAYOUT_H, JSON.stringify(layout))
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
        <Panel defaultSize={chatOpen ? 54 : 82} minSize={30}>
          <Group
            orientation="vertical"
            defaultLayout={loadLayout(STORAGE_KEY_LAYOUT_V)}
            onLayoutChange={(layout: Layout) =>
              localStorage.setItem(STORAGE_KEY_LAYOUT_V, JSON.stringify(layout))
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

            {/* Right: AI Chat Panel */}
            <Panel defaultSize={28} minSize={20} maxSize={50}>
              <ChatPanel />
            </Panel>
          </>
        )}
      </Group>

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
        <button
          className={styles.chatToggleBtn}
          onClick={() => setChatOpen((v) => !v)}
          title={chatOpen ? "Hide AI chat" : "Show AI chat"}
        >
          {chatOpen ? "✕ Chat" : "✦ Chat"}
        </button>
      </div>

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
          <AppInner />
        </CostProvider>
      </ProviderProvider>
    </ProjectProvider>
  );
}
