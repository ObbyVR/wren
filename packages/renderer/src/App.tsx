import { useState, useCallback } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { Layout } from "react-resizable-panels";
import { FileTree } from "./components/FileTree";
import { Editor } from "./components/Editor";
import { Terminal } from "./components/Terminal";
import styles from "./App.module.css";

const STORAGE_KEY_ROOT = "wren:rootPath";
const STORAGE_KEY_LAYOUT_H = "wren:layout:horizontal";
const STORAGE_KEY_LAYOUT_V = "wren:layout:vertical";

function loadLayout(key: string): Layout | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Layout;
  } catch { /* ignore */ }
  return undefined;
}

export default function App() {
  const [rootPath, setRootPath] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY_ROOT),
  );
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const handleFileOpen = useCallback((path: string) => {
    setOpenFilePath(path);
    setActiveFilePath(path);
  }, []);

  const handlePathHandled = useCallback(() => {
    setOpenFilePath(null);
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const path = window.prompt("Enter folder path:");
    if (path && path.trim()) {
      const trimmed = path.trim();
      setRootPath(trimmed);
      localStorage.setItem(STORAGE_KEY_ROOT, trimmed);
    }
  }, []);

  const termCwd = rootPath ?? "/";

  return (
    <div className={styles.shell}>
      <Group
        orientation="horizontal"
        defaultLayout={loadLayout(STORAGE_KEY_LAYOUT_H)}
        onLayoutChange={(layout: Layout) =>
          localStorage.setItem(STORAGE_KEY_LAYOUT_H, JSON.stringify(layout))
        }
      >
        {/* Left: File Tree */}
        <Panel defaultSize={20} minSize={12} maxSize={40}>
          <FileTree
            rootPath={rootPath}
            activePath={activeFilePath}
            onFileOpen={handleFileOpen}
            onOpenFolder={handleOpenFolder}
          />
        </Panel>

        <Separator className={styles.hHandle} />

        {/* Center+Right: Editor + Terminal stacked vertically */}
        <Panel defaultSize={80} minSize={40}>
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
      </Group>
    </div>
  );
}
