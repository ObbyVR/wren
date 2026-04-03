import { useState, useCallback } from "react";
import type { FileEntry } from "@wren/shared";
import styles from "./FileTree.module.css";

interface FileNodeProps {
  entry: FileEntry;
  depth: number;
  activePath: string | null;
  onFileOpen: (path: string) => void;
}

function FileNode({ entry, depth, activePath, onFileOpen }: FileNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const paddingLeft = 8 + depth * 16;

  const handleClick = useCallback(async () => {
    if (entry.isDirectory) {
      if (!expanded && children === null) {
        setLoading(true);
        try {
          const entries = await window.wren.invoke("fs:readdir", entry.path);
          setChildren(entries);
        } catch (err) {
          console.error("readdir failed", err);
          setChildren([]);
        } finally {
          setLoading(false);
        }
      }
      setExpanded((v) => !v);
    } else {
      onFileOpen(entry.path);
    }
  }, [entry, expanded, children, onFileOpen]);

  const isActive = !entry.isDirectory && activePath === entry.path;

  return (
    <>
      <div
        className={`${styles.node} ${isActive ? styles.nodeActive : ""}`}
        style={{ paddingLeft }}
        onClick={handleClick}
        title={entry.path}
      >
        <span className={`${styles.icon} ${entry.isDirectory ? styles.iconDir : ""}`}>
          {entry.isDirectory ? (expanded ? "▼" : "▶") : fileIcon(entry.name)}
        </span>
        <span className={styles.name}>
          {loading ? `${entry.name} …` : entry.name}
        </span>
      </div>

      {entry.isDirectory && expanded && children && (
        <div className={styles.children}>
          {children.map((child) => (
            <FileNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              activePath={activePath}
              onFileOpen={onFileOpen}
            />
          ))}
          {children.length === 0 && (
            <div style={{ paddingLeft: paddingLeft + 16, color: "var(--text-muted)", fontSize: 12, padding: "2px 0" }}>
              Empty
            </div>
          )}
        </div>
      )}
    </>
  );
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "𝑻", tsx: "⚛", js: "𝑱", jsx: "⚛", json: "{ }",
    css: "🎨", html: "🌐", md: "📝", py: "🐍", rs: "🦀",
    go: "🐹", sh: "⚡", yml: "⚙", yaml: "⚙", toml: "⚙",
    svg: "🖼", png: "🖼", jpg: "🖼", gif: "🖼",
    lock: "🔒", env: "🔑",
  };
  return map[ext] ?? "·";
}

interface FileTreeProps {
  rootPath: string | null;
  activePath: string | null;
  onFileOpen: (path: string) => void;
  onOpenFolder: () => void;
}

export function FileTree({ rootPath, activePath, onFileOpen, onOpenFolder }: FileTreeProps) {
  const [rootEntries, setRootEntries] = useState<FileEntry[] | null>(null);
  const [lastRoot, setLastRoot] = useState<string | null>(null);

  if (rootPath !== lastRoot) {
    setLastRoot(rootPath);
    setRootEntries(null);
    if (rootPath) {
      window.wren.invoke("fs:readdir", rootPath).then(setRootEntries).catch(console.error);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          {rootPath ? rootPath.split("/").pop() : "Explorer"}
        </span>
        <button className={styles.openBtn} onClick={onOpenFolder} title="Open folder">
          📂 Open
        </button>
      </div>

      <div className={styles.tree}>
        {!rootPath && (
          <div className={styles.empty}>No folder open</div>
        )}
        {rootPath && rootEntries === null && (
          <div className={styles.empty}>Loading…</div>
        )}
        {rootPath && rootEntries && rootEntries.map((entry) => (
          <FileNode
            key={entry.path}
            entry={entry}
            depth={0}
            activePath={activePath}
            onFileOpen={onFileOpen}
          />
        ))}
      </div>
    </div>
  );
}
