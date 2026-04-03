import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type {
  AgenticAction,
  AgenticApprovalRequest,
  AgenticSettings,
  ApprovalMode,
} from "@wren/shared";
import { useProjects } from "./projectStore";

interface AgenticContextValue {
  /** Whether agentic mode is active for the current project */
  agenticEnabled: boolean;
  toggleAgentic: () => void;

  /** Action log for the current project */
  actionLog: AgenticAction[];
  clearLog: () => void;

  /** Pending approval request (null if none) */
  pendingApproval: AgenticApprovalRequest | null;
  approve: () => void;
  approveAll: () => void;
  reject: () => void;

  /** Settings for the current project */
  settings: AgenticSettings;
  updateSettings: (patch: Partial<AgenticSettings>) => void;
  setApprovalMode: (mode: ApprovalMode) => void;

  /** Undo last action */
  rollback: () => Promise<void>;
  /** Undo all actions this session */
  rollbackAll: () => Promise<void>;
}

const AgenticContext = createContext<AgenticContextValue | null>(null);

const DEFAULT_SETTINGS: AgenticSettings = {
  approvalMode: "selective",
  maxActionsPerSession: 50,
  autoSnapshot: true,
};

export function AgenticProvider({ children }: { children: ReactNode }) {
  const { activeProject } = useProjects();
  const projectId = activeProject?.id ?? "";

  const [agenticEnabled, setAgenticEnabled] = useState(false);
  const [actionLog, setActionLog] = useState<AgenticAction[]>([]);
  const [pendingApproval, setPendingApproval] = useState<AgenticApprovalRequest | null>(null);
  const [settings, setSettings] = useState<AgenticSettings>(DEFAULT_SETTINGS);

  // Load log + settings on project change
  useEffect(() => {
    if (!projectId) return;
    void window.wren.invoke("agentic:get-log", { projectId }).then(setActionLog).catch(() => {});
    void window.wren.invoke("agentic:get-settings", { projectId }).then(setSettings).catch(() => {});
  }, [projectId]);

  // Subscribe to approval requests from main
  useEffect(() => {
    const unsub = window.wren.onAgenticApprovalRequest((req) => {
      if (req.projectId === projectId) {
        setPendingApproval(req);
      }
    });
    return unsub;
  }, [projectId]);

  // Subscribe to completed actions from main
  useEffect(() => {
    const unsub = window.wren.onAgenticActionDone(({ projectId: pid, action }) => {
      if (pid === projectId) {
        setActionLog((prev) => [...prev, action]);
      }
    });
    return unsub;
  }, [projectId]);

  const toggleAgentic = useCallback(() => {
    setAgenticEnabled((v) => !v);
  }, []);

  const clearLog = useCallback(() => {
    if (!projectId) return;
    void window.wren.invoke("agentic:clear-log", { projectId }).then(() => setActionLog([])).catch(() => {});
  }, [projectId]);

  const approve = useCallback(() => {
    if (!pendingApproval || !projectId) return;
    void window.wren.invoke("agentic:approve", {
      requestId: pendingApproval.requestId,
      projectId,
    }).catch(() => {});
    setPendingApproval(null);
  }, [pendingApproval, projectId]);

  const approveAll = useCallback(() => {
    if (!projectId) return;
    // Switch approval mode to auto for this session
    void window.wren.invoke("agentic:set-approval-mode", {
      projectId,
      mode: "auto",
    }).catch(() => {});
    setSettings((prev) => ({ ...prev, approvalMode: "auto" }));
    if (pendingApproval) {
      void window.wren.invoke("agentic:approve", {
        requestId: pendingApproval.requestId,
        projectId,
      }).catch(() => {});
      setPendingApproval(null);
    }
  }, [pendingApproval, projectId]);

  const reject = useCallback(() => {
    if (!pendingApproval || !projectId) return;
    void window.wren.invoke("agentic:reject", {
      requestId: pendingApproval.requestId,
      projectId,
    }).catch(() => {});
    setPendingApproval(null);
  }, [pendingApproval, projectId]);

  const updateSettings = useCallback(
    (patch: Partial<AgenticSettings>) => {
      if (!projectId) return;
      void window.wren
        .invoke("agentic:set-settings", { projectId, settings: patch })
        .then((updated) => setSettings(updated))
        .catch(() => {});
    },
    [projectId],
  );

  const setApprovalMode = useCallback(
    (mode: ApprovalMode) => {
      updateSettings({ approvalMode: mode });
    },
    [updateSettings],
  );

  const rollback = useCallback(async () => {
    if (!projectId) return;
    await window.wren.invoke("agentic:rollback", { projectId });
    // Refresh log
    const log = await window.wren.invoke("agentic:get-log", { projectId });
    setActionLog(log);
  }, [projectId]);

  const rollbackAll = useCallback(async () => {
    if (!projectId || actionLog.length === 0) return;
    const firstSnapshot = actionLog.find((a) => a.snapshotId);
    if (firstSnapshot?.snapshotId) {
      await window.wren.invoke("agentic:rollbackTo", {
        projectId,
        snapshotId: firstSnapshot.snapshotId,
      });
    }
    const log = await window.wren.invoke("agentic:get-log", { projectId });
    setActionLog(log);
  }, [projectId, actionLog]);

  return (
    <AgenticContext.Provider
      value={{
        agenticEnabled,
        toggleAgentic,
        actionLog,
        clearLog,
        pendingApproval,
        approve,
        approveAll,
        reject,
        settings,
        updateSettings,
        setApprovalMode,
        rollback,
        rollbackAll,
      }}
    >
      {children}
    </AgenticContext.Provider>
  );
}

export function useAgentic() {
  const ctx = useContext(AgenticContext);
  if (!ctx) throw new Error("useAgentic must be used inside AgenticProvider");
  return ctx;
}
