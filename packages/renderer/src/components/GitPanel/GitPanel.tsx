import { useState, useEffect, useCallback } from "react";
import type {
  GitStatus,
  GitFileEntry,
  GitFileStatus,
  GitDiff,
  BranchInfo,
} from "@wren/shared";
import { useProjects } from "../../store/projectStore";
import styles from "./GitPanel.module.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusLabel(status: GitFileStatus): string {
  switch (status) {
    case "modified": return "M";
    case "added": return "A";
    case "deleted": return "D";
    case "renamed": return "R";
    case "copied": return "C";
    case "untracked": return "?";
    case "ignored": return "!";
    case "conflicted": return "!";
    default: return "?";
  }
}

function statusClass(status: GitFileStatus): string {
  switch (status) {
    case "modified": return styles.fileModified;
    case "added": return styles.fileAdded;
    case "deleted": return styles.fileDeleted;
    case "renamed": return styles.fileRenamed;
    case "untracked": return styles.fileUntracked;
    case "conflicted": return styles.fileConflicted;
    default: return styles.fileUntracked;
  }
}

// ── Diff Viewer ───────────────────────────────────────────────────────────────

interface DiffViewerProps {
  diff: GitDiff | null;
  loading: boolean;
  filePath: string;
  onClose: () => void;
}

function DiffViewer({ diff, loading, filePath, onClose }: DiffViewerProps) {
  return (
    <div className={styles.diffOverlay}>
      <div className={styles.diffPanel}>
        <div className={styles.diffHeader}>
          <span className={styles.diffTitle}>{filePath}</span>
          <button className={styles.diffClose} onClick={onClose}>×</button>
        </div>
        <div className={styles.diffBody}>
          {loading && <div className={styles.diffLoading}>Loading diff…</div>}
          {!loading && diff && diff.files.length === 0 && (
            <div className={styles.diffEmpty}>No changes</div>
          )}
          {!loading && diff && diff.files.map((file, fi) => (
            <div key={fi}>
              {file.hunks.map((hunk, hi) => (
                <div key={hi}>
                  <div className={styles.diffHunkHeader}>{hunk.header}</div>
                  {hunk.lines.map((line, li) => (
                    <div
                      key={li}
                      className={
                        line.type === "add"
                          ? styles.diffLineAdd
                          : line.type === "remove"
                            ? styles.diffLineRemove
                            : styles.diffLineContext
                      }
                    >
                      <span className={styles.diffLineNo}>
                        {line.type === "add"
                          ? `+${line.newLineNo ?? ""}`
                          : line.type === "remove"
                            ? `-${line.oldLineNo ?? ""}`
                            : `${line.oldLineNo ?? ""}`}
                      </span>
                      <span className={styles.diffLineContent}>{line.content}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Create Branch Modal ───────────────────────────────────────────────────────

interface CreateBranchModalProps {
  repoPath: string;
  onClose: () => void;
  onCreated: () => void;
}

function CreateBranchModal({ repoPath, onClose, onCreated }: CreateBranchModalProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const n = name.trim();
    if (!n) return;
    setLoading(true);
    setError(null);
    try {
      await window.wren.invoke("git:create-branch", { repoPath, name: n });
      await window.wren.invoke("git:switch-branch", { repoPath, name: n });
      onCreated();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span>Create Branch</span>
          <button className={styles.diffClose} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          <input
            className={styles.branchInput}
            type="text"
            placeholder="branch-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); if (e.key === "Escape") onClose(); }}
            autoFocus
          />
          {error && <div className={styles.errorMsg}>{error}</div>}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose}>Cancel</button>
          <button
            className={styles.btnPrimary}
            onClick={() => void handleCreate()}
            disabled={!name.trim() || loading}
          >
            {loading ? "Creating…" : "Create & Switch"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main GitPanel ─────────────────────────────────────────────────────────────

export function GitPanel() {
  const { activeProject } = useProjects();
  const repoPath = activeProject?.rootPath ?? null;

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);

  const [diffFile, setDiffFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [showBranches, setShowBranches] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [switchingBranch, setSwitchingBranch] = useState(false);

  const refresh = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const status = await window.wren.invoke("git:status", { repoPath });
      setGitStatus(status);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadBranches = useCallback(async () => {
    if (!repoPath) return;
    try {
      const list = await window.wren.invoke("git:list-branches", { repoPath, includeRemote: false });
      setBranches(list);
    } catch { /* ignore */ }
  }, [repoPath]);

  const handleFileClick = useCallback(async (file: GitFileEntry) => {
    if (!repoPath) return;
    setDiffFile(file.path);
    setDiff(null);
    setDiffLoading(true);
    try {
      const d = await window.wren.invoke("git:diff", {
        repoPath,
        filePath: file.path,
        staged: file.staged,
      });
      setDiff(d);
    } catch { setDiff(null); }
    finally { setDiffLoading(false); }
  }, [repoPath]);

  const toggleStage = useCallback(async (file: GitFileEntry) => {
    if (!repoPath) return;
    try {
      if (file.staged) {
        await window.wren.invoke("git:unstage", { repoPath, paths: [file.path] });
      } else {
        await window.wren.invoke("git:stage", { repoPath, paths: [file.path] });
      }
      await refresh();
    } catch (e) { setError(String(e)); }
  }, [repoPath, refresh]);

  const handleStageAll = useCallback(async () => {
    if (!repoPath || !gitStatus) return;
    const unstaged = gitStatus.files.filter((f) => !f.staged && f.status !== "ignored").map((f) => f.path);
    if (unstaged.length === 0) return;
    try {
      await window.wren.invoke("git:stage", { repoPath, paths: unstaged });
      await refresh();
    } catch (e) { setError(String(e)); }
  }, [repoPath, gitStatus, refresh]);

  const handleCommit = useCallback(async () => {
    if (!repoPath || !commitMsg.trim()) return;
    setCommitting(true);
    setError(null);
    try {
      await window.wren.invoke("git:commit", { repoPath, message: commitMsg.trim() });
      setCommitMsg("");
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setCommitting(false); }
  }, [repoPath, commitMsg, refresh]);

  const handlePush = useCallback(async () => {
    if (!repoPath) return;
    setPushing(true);
    setError(null);
    try {
      await window.wren.invoke("git:push", { repoPath });
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setPushing(false); }
  }, [repoPath, refresh]);

  const handlePull = useCallback(async () => {
    if (!repoPath) return;
    setPulling(true);
    setError(null);
    try {
      await window.wren.invoke("git:pull", { repoPath });
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setPulling(false); }
  }, [repoPath, refresh]);

  const handleSwitchBranch = useCallback(async (name: string) => {
    if (!repoPath) return;
    setSwitchingBranch(true);
    try {
      await window.wren.invoke("git:switch-branch", { repoPath, name });
      setShowBranches(false);
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setSwitchingBranch(false); }
  }, [repoPath, refresh]);

  if (!repoPath) {
    return (
      <div className={styles.noRepo}>
        <span className={styles.noRepoIcon}>⎇</span>
        <span>No project open</span>
      </div>
    );
  }

  if (!gitStatus?.isRepo) {
    return (
      <div className={styles.noRepo}>
        <span className={styles.noRepoIcon}>⎇</span>
        <span>Not a git repository</span>
        <button className={styles.refreshBtn} onClick={() => void refresh()}>Refresh</button>
      </div>
    );
  }

  const unstagedFiles = gitStatus.files.filter((f) => !f.staged && f.status !== "ignored");
  const stagedFiles = gitStatus.files.filter((f) => f.staged);

  return (
    <div className={styles.panel}>
      {/* Header: branch + sync */}
      <div className={styles.header}>
        <div className={styles.branchArea}>
          <button
            className={styles.branchBtn}
            onClick={() => { setShowBranches((v) => !v); void loadBranches(); }}
            title="Switch branch"
          >
            <span className={styles.branchIcon}>⎇</span>
            <span className={styles.branchName}>{gitStatus.branch}</span>
            {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
              <span className={styles.branchSync}>
                {gitStatus.ahead > 0 && `↑${gitStatus.ahead}`}
                {gitStatus.behind > 0 && `↓${gitStatus.behind}`}
              </span>
            )}
            <span className={styles.branchChevron}>▾</span>
          </button>

          {showBranches && (
            <div className={styles.branchDropdown}>
              <div className={styles.branchDropdownHeader}>
                <span>Branches</span>
                <button
                  className={styles.newBranchBtn}
                  onClick={() => { setShowBranches(false); setShowCreateBranch(true); }}
                >
                  + New
                </button>
              </div>
              {switchingBranch ? (
                <div className={styles.branchLoading}>Switching…</div>
              ) : (
                branches.map((b) => (
                  <button
                    key={b.name}
                    className={`${styles.branchItem} ${b.isCurrent ? styles.branchItemActive : ""}`}
                    onClick={() => void handleSwitchBranch(b.name)}
                  >
                    {b.isCurrent && <span className={styles.branchCheck}>✓ </span>}
                    {b.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className={styles.syncBtns}>
          <button
            className={styles.syncBtn}
            onClick={() => void handlePull()}
            disabled={pulling}
            title="Pull"
          >
            {pulling ? "…" : "↓"}
          </button>
          <button
            className={styles.syncBtn}
            onClick={() => void handlePush()}
            disabled={pushing}
            title="Push"
          >
            {pushing ? "…" : "↑"}
          </button>
          <button
            className={styles.syncBtn}
            onClick={() => void refresh()}
            disabled={loading}
            title="Refresh"
          >
            ↺
          </button>
        </div>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.body}>
        {/* Staged files */}
        {stagedFiles.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>Staged ({stagedFiles.length})</span>
            </div>
            {stagedFiles.map((file) => (
              <div key={file.path} className={styles.fileRow}>
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => void toggleStage(file)}
                  className={styles.fileCheckbox}
                  title="Unstage"
                />
                <span
                  className={`${styles.fileStatus} ${statusClass(file.status)}`}
                  title={file.status}
                >
                  {statusLabel(file.status)}
                </span>
                <span
                  className={styles.fileName}
                  onClick={() => void handleFileClick(file)}
                  title={file.path}
                >
                  {file.path.split("/").pop()}
                  <span className={styles.filePath}>{file.path}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Unstaged / untracked files */}
        {unstagedFiles.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>Changes ({unstagedFiles.length})</span>
              <button className={styles.stageAllBtn} onClick={() => void handleStageAll()}>
                Stage all
              </button>
            </div>
            {unstagedFiles.map((file) => (
              <div key={file.path} className={styles.fileRow}>
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => void toggleStage(file)}
                  className={styles.fileCheckbox}
                  title="Stage"
                />
                <span
                  className={`${styles.fileStatus} ${statusClass(file.status)}`}
                  title={file.status}
                >
                  {statusLabel(file.status)}
                </span>
                <span
                  className={styles.fileName}
                  onClick={() => void handleFileClick(file)}
                  title={file.path}
                >
                  {file.path.split("/").pop()}
                  <span className={styles.filePath}>{file.path}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {gitStatus.files.length === 0 && (
          <div className={styles.cleanState}>
            <span>✓</span>
            <span>Working tree clean</span>
          </div>
        )}
      </div>

      {/* Commit form */}
      <div className={styles.commitArea}>
        <textarea
          className={styles.commitMsg}
          placeholder="Commit message…"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          rows={2}
        />
        <button
          className={styles.commitBtn}
          onClick={() => void handleCommit()}
          disabled={!commitMsg.trim() || stagedFiles.length === 0 || committing}
          title={stagedFiles.length === 0 ? "Stage files first" : "Commit staged changes"}
        >
          {committing ? "Committing…" : `Commit (${stagedFiles.length})`}
        </button>
      </div>

      {/* Diff viewer */}
      {diffFile !== null && (
        <DiffViewer
          diff={diff}
          loading={diffLoading}
          filePath={diffFile}
          onClose={() => setDiffFile(null)}
        />
      )}

      {/* Create branch modal */}
      {showCreateBranch && repoPath && (
        <CreateBranchModal
          repoPath={repoPath}
          onClose={() => setShowCreateBranch(false)}
          onCreated={() => void refresh()}
        />
      )}
    </div>
  );
}
