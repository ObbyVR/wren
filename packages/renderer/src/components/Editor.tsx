import { useState, useEffect, useCallback, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import styles from "./Editor.module.css";

interface Tab {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

function extToLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", css: "css", html: "html", md: "markdown",
    py: "python", rs: "rust", go: "go", sh: "shell",
    yml: "yaml", yaml: "yaml", toml: "toml", xml: "xml",
    c: "c", cpp: "cpp", h: "cpp",
  };
  return map[ext] ?? "plaintext";
}

interface EditorProps {
  openPath: string | null;
  onPathHandled: () => void;
}

export function Editor({ openPath, onPathHandled }: EditorProps) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const pendingOpen = useRef<string | null>(null);

  // Open a new file path (dedup if already open)
  const openFile = useCallback(async (filePath: string) => {
    const existing = tabs.find((t) => t.path === filePath);
    if (existing) {
      setActiveTabPath(filePath);
      return;
    }
    try {
      const content = await window.wren.invoke("fs:readfile", filePath);
      const name = filePath.split("/").pop() ?? filePath;
      setTabs((prev) => [...prev, { path: filePath, name, content, dirty: false }]);
      setActiveTabPath(filePath);
    } catch (err) {
      console.error("readfile failed", err);
    }
  }, [tabs]);

  // Respond to parent requesting a file open
  useEffect(() => {
    if (openPath && openPath !== pendingOpen.current) {
      pendingOpen.current = openPath;
      openFile(openPath).then(() => {
        onPathHandled();
        pendingOpen.current = null;
      });
    }
  }, [openPath, openFile, onPathHandled]);

  // Keyboard shortcut: Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!activeTabPath) return;
        const tab = tabs.find((t) => t.path === activeTabPath);
        if (!tab || !tab.dirty) return;
        window.wren
          .invoke("fs:writefile", { path: tab.path, content: tab.content })
          .then(() => {
            setTabs((prev) =>
              prev.map((t) => (t.path === activeTabPath ? { ...t, dirty: false } : t)),
            );
          })
          .catch(console.error);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTabPath, tabs]);

  const closeTab = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.path === path);
        const next = prev.filter((t) => t.path !== path);
        if (activeTabPath === path) {
          const newActive = next[idx] ?? next[idx - 1] ?? null;
          setActiveTabPath(newActive?.path ?? null);
        }
        return next;
      });
    },
    [activeTabPath],
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeTabPath || value === undefined) return;
      setTabs((prev) =>
        prev.map((t) =>
          t.path === activeTabPath ? { ...t, content: value, dirty: true } : t,
        ),
      );
    },
    [activeTabPath],
  );

  const activeTab = tabs.find((t) => t.path === activeTabPath) ?? null;

  return (
    <div className={styles.root}>
      {tabs.length > 0 && (
        <div className={styles.tabBar}>
          {tabs.map((tab) => (
            <div
              key={tab.path}
              className={`${styles.tab} ${tab.path === activeTabPath ? styles.tabActive : ""}`}
              onClick={() => setActiveTabPath(tab.path)}
              title={tab.path}
            >
              <span className={styles.tabName}>{tab.name}</span>
              {tab.dirty && <span className={styles.tabDirty}>●</span>}
              <button
                className={styles.tabClose}
                onClick={(e) => closeTab(e, tab.path)}
                title="Close tab"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.editorWrapper}>
        {activeTab ? (
          <MonacoEditor
            key={activeTab.path}
            height="100%"
            language={extToLanguage(activeTab.path)}
            value={activeTab.content}
            theme="vs-dark"
            onChange={handleEditorChange}
            options={{
              fontFamily: "JetBrains Mono, Fira Code, monospace",
              fontSize: 13,
              lineHeight: 20,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "off",
              renderWhitespace: "selection",
              bracketPairColorization: { enabled: true },
              padding: { top: 8, bottom: 8 },
              smoothScrolling: true,
              cursorSmoothCaretAnimation: "on",
            }}
          />
        ) : (
          <div className={styles.empty}>
            <span className={styles.emptyLogo}>🪶</span>
            <span>Open a file from the file tree</span>
          </div>
        )}
      </div>
    </div>
  );
}
