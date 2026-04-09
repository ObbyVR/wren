import { useState, useEffect, useCallback, useRef } from "react";
import type { BridgeStatus } from "@wren/shared";
import { useProjects } from "../../store/projectStore";
import styles from "./PreviewPanel.module.css";

interface NetworkEntry {
  requestId: string;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  duration?: number;
  error?: string;
  type: "request" | "response" | "error";
  timestamp: number;
}

const DEFAULT_PREVIEW_URL = "http://localhost:3000";
const WREN_WINDOW_ID = "wren-preview-main";

export function PreviewPanel() {
  const [activeUrl, setActiveUrl] = useState("");
  const [inputUrl, setInputUrl] = useState(DEFAULT_PREVIEW_URL);
  const [isOpen, setIsOpen] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ connected: false, windowCount: 0 });
  const [networkLog, setNetworkLog] = useState<NetworkEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"preview" | "network">("preview");
  const [error, setError] = useState<string | null>(null);
  const [, setIsRefreshing] = useState(false);

  const { activeProject } = useProjects();
  const isOpenRef = useRef(false);
  isOpenRef.current = isOpen;

  // Auto-open when AI sends a URL
  useEffect(() => {
    const handler = () => {
      const autoUrl = localStorage.getItem("wren:preview-auto-url");
      if (autoUrl) {
        localStorage.removeItem("wren:preview-auto-url");
        setInputUrl(autoUrl);
        setActiveUrl(autoUrl);
        setIsOpen(true);
      }
    };
    window.addEventListener("wren:preview-url-changed", handler);
    handler(); // check on mount
    return () => window.removeEventListener("wren:preview-url-changed", handler);
  }, []);

  const cleanupRef = useRef<(() => void)[]>([]);

  // ── Bridge event subscriptions ────────────────────────────────────────────

  useEffect(() => {
    const wren = window.wren;

    const unsubOpened = wren.onBridgePreviewOpened(() => {
      setIsOpen(true);
      setError(null);
    });

    const unsubClosed = wren.onBridgePreviewClosed(({ reason }) => {
      setIsOpen(false);
      if (reason === "user-closed") {
        setError(null);
      }
    });

    const unsubError = wren.onBridgePreviewError(({ error: err }) => {
      setError(err);
      setIsOpen(false);
    });

    const unsubNetwork = wren.onBridgeNetworkEvent(({ event }) => {
      setNetworkLog((prev) => {
        const next = [...prev];
        const existing = next.findIndex((e) => e.requestId === event.requestId);
        if (event.type === "request") {
          next.push({ ...event });
        } else if (existing !== -1) {
          next[existing] = { ...next[existing], ...event };
        }
        // Keep last 200 entries
        return next.slice(-200);
      });
    });

    const unsubStatus = wren.onBridgeStatusChanged((status) => {
      setBridgeStatus(status);
      if (!status.connected && isOpen) {
        setIsOpen(false);
      }
    });

    // Load initial status
    wren.invoke("bridge:get-status").then(setBridgeStatus).catch(console.error);

    cleanupRef.current = [unsubOpened, unsubClosed, unsubError, unsubNetwork, unsubStatus];
    return () => {
      cleanupRef.current.forEach((fn) => fn());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Hot reload: trigger preview refresh when agentic engine writes a file ────

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const projectId = activeProject?.id;
    if (!projectId) return;

    const unsub = window.wren.onAgenticActionDone(({ projectId: pid, action }) => {
      if (pid !== projectId) return;
      // Only trigger reload for file mutations
      if (action.type !== "writeFile" && action.type !== "deleteFile") return;
      if (action.status !== "success") return;
      if (!isOpenRef.current) return;

      // Debounce rapid sequences
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setIsRefreshing(true);
        void window.wren
          .invoke("bridge:reload-preview", { wrenWindowId: WREN_WINDOW_ID })
          .catch(() => {})
          .finally(() => setTimeout(() => setIsRefreshing(false), 800));
      }, 300);
    });

    return () => {
      unsub();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeProject?.id]);


  // ── Actions ───────────────────────────────────────────────────────────────

  const handleOpen = useCallback(() => {
    setError(null);
    setNetworkLog([]);
    setActiveUrl(inputUrl.trim());
    setIsOpen(true);
  }, [inputUrl]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setActiveUrl("");
  }, []);

  const handleNavigate = useCallback(() => {
    setActiveUrl(inputUrl.trim());
    setIsOpen(true);
  }, [inputUrl]);

  const handleClearNetwork = useCallback(() => setNetworkLog([]), []);

  // ── Render ────────────────────────────────────────────────────────────────

  const statusDot = bridgeStatus.connected ? styles.dotConnected : styles.dotDisconnected;
  const statusLabel = bridgeStatus.connected ? "Bridge connected" : "Bridge not connected";

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.statusRow}>
          <span className={`${styles.dot} ${statusDot}`} title={statusLabel} />
          <span className={styles.statusText}>{statusLabel}</span>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === "preview" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("preview")}
          >
            Preview
          </button>
          <button
            className={`${styles.tab} ${activeTab === "network" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("network")}
          >
            Network {networkLog.length > 0 && <span className={styles.badge}>{networkLog.length}</span>}
          </button>
        </div>
      </div>

      {activeTab === "preview" && (
        <div className={styles.previewTab}>
          {/* URL bar */}
          <div className={styles.urlBar}>
            <input
              className={styles.urlInput}
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (isOpen) void handleNavigate();
                  else void handleOpen();
                }
              }}
              placeholder="http://localhost:3000"
              spellCheck={false}
            />
            {!isOpen ? (
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => void handleOpen()}
                title="Open preview"
              >
                ▶ Open
              </button>
            ) : (
              <button
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={() => void handleClose()}
              >
                ■ Close
              </button>
            )}
          </div>

          {/* Status / instructions */}
          {error && (
            <div className={styles.errorBanner}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Embedded preview */}
          {isOpen ? (
            <iframe
              src={activeUrl}
              className={styles.embeddedPreview}
              title="Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className={styles.emptyState}>
              <p>Enter a URL and click <strong>▶ Open</strong></p>
            </div>
          )}
        </div>
      )}

      {activeTab === "network" && (
        <div className={styles.networkTab}>
          <div className={styles.networkToolbar}>
            <span className={styles.networkCount}>{networkLog.length} requests</span>
            <button className={styles.btnSmall} onClick={handleClearNetwork}>Clear</button>
          </div>
          {networkLog.length === 0 ? (
            <div className={styles.emptyState}>No network activity recorded.</div>
          ) : (
            <div className={styles.networkList}>
              {networkLog.map((entry, i) => (
                <div
                  key={`${entry.requestId}-${i}`}
                  className={`${styles.networkRow} ${entry.type === "error" ? styles.networkRowError : ""}`}
                  title={entry.url}
                >
                  <span className={styles.networkMethod}>{entry.method}</span>
                  <span className={styles.networkStatus}>
                    {entry.type === "response" && entry.status != null
                      ? entry.status
                      : entry.type === "error"
                      ? "ERR"
                      : "…"}
                  </span>
                  <span className={styles.networkUrl}>{trimUrl(entry.url)}</span>
                  {entry.duration != null && (
                    <span className={styles.networkDuration}>{entry.duration}ms</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function trimUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? u.search : "");
  } catch {
    return url.length > 60 ? url.slice(0, 60) + "…" : url;
  }
}
