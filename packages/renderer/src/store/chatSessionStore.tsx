import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ChatSessionState, ChatSessionMode, ProviderId } from "@wren/shared";
import { PROVIDER_META } from "./providerStore";

// ── Helpers ──────────────────────────────────────────────────────────────────

function storageKey(projectId: string) {
  return `wren:chatSessions:${projectId}`;
}

function loadSessions(projectId: string): ChatSessionState[] {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (raw) return JSON.parse(raw) as ChatSessionState[];
  } catch { /* ignore */ }
  return [];
}

function saveSessions(projectId: string, sessions: ChatSessionState[]) {
  localStorage.setItem(storageKey(projectId), JSON.stringify(sessions));
}

let counter = 0;
function nextSessionId() {
  return `chat-${Date.now()}-${++counter}`;
}

function autoLabel(providerId: ProviderId, existing: ChatSessionState[]): string {
  const baseName = PROVIDER_META[providerId]?.name ?? providerId;
  const sameProvider = existing.filter((s) => s.providerId === providerId);
  if (sameProvider.length === 0) return baseName;
  return `${baseName} #${sameProvider.length + 1}`;
}

// ── Context ──────────────────────────────────────────────────────────────────

interface ChatSessionContextValue {
  sessions: ChatSessionState[];
  addSession: (providerId: ProviderId, modelId?: string, mode?: ChatSessionMode) => string;
  removeSession: (id: string) => void;
  toggleCollapse: (id: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

interface ChatSessionProviderProps {
  projectId: string;
  defaultProviderId: ProviderId;
  children: ReactNode;
}

export function ChatSessionProvider({
  projectId,
  defaultProviderId,
  children,
}: ChatSessionProviderProps) {
  const [sessions, setSessions] = useState<ChatSessionState[]>(() => {
    const saved = loadSessions(projectId);
    if (saved.length > 0) {
      // Migrate: "browser" mode replaced by "subscription" (CLI-based), keep "api" as-is
      return saved.map((s) => ({
        ...s,
        mode: (s.mode === "browser" || !s.mode) ? "subscription" as ChatSessionMode : s.mode,
      }));
    }
    const defaultModel = PROVIDER_META[defaultProviderId]?.defaultModel ?? "";
    return [
      {
        id: nextSessionId(),
        providerId: defaultProviderId,
        modelId: defaultModel,
        label: PROVIDER_META[defaultProviderId]?.name ?? "Chat",
        collapsed: false,
        mode: "subscription" as ChatSessionMode,
      },
    ];
  });

  const persist = useCallback(
    (next: ChatSessionState[]) => {
      setSessions(next);
      saveSessions(projectId, next);
    },
    [projectId],
  );

  const addSession = useCallback(
    (providerId: ProviderId, modelId?: string, mode?: ChatSessionMode): string => {
      const id = nextSessionId();
      const sessionMode = mode ?? "subscription";
      const model = modelId ?? PROVIDER_META[providerId]?.defaultModel ?? "";
      const label = sessionMode === "browser"
        ? autoLabel(providerId, sessions)
        : `${autoLabel(providerId, sessions)} (API)`;
      const session: ChatSessionState = {
        id,
        providerId,
        modelId: model,
        label,
        collapsed: false,
        mode: sessionMode,
      };
      persist([...sessions, session]);
      return id;
    },
    [sessions, persist],
  );

  const removeSession = useCallback(
    (id: string) => {
      if (sessions.length <= 1) return; // keep at least one
      persist(sessions.filter((s) => s.id !== id));
    },
    [sessions, persist],
  );

  const toggleCollapse = useCallback(
    (id: string) => {
      persist(
        sessions.map((s) =>
          s.id === id ? { ...s, collapsed: !s.collapsed } : s,
        ),
      );
    },
    [sessions, persist],
  );

  const collapseAll = useCallback(() => {
    persist(sessions.map((s) => ({ ...s, collapsed: true })));
  }, [sessions, persist]);

  const expandAll = useCallback(() => {
    persist(sessions.map((s) => ({ ...s, collapsed: false })));
  }, [sessions, persist]);

  return (
    <ChatSessionContext.Provider
      value={{ sessions, addSession, removeSession, toggleCollapse, collapseAll, expandAll }}
    >
      {children}
    </ChatSessionContext.Provider>
  );
}

export function useChatSessions() {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) throw new Error("useChatSessions must be used inside ChatSessionProvider");
  return ctx;
}
