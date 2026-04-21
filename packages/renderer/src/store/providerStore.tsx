import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ProviderConfig, ProviderId } from "@wren/shared";

// ── Provider metadata ─────────────────────────────────────────────────────────

export const PROVIDER_META: Record<
  ProviderId,
  { name: string; color: string; defaultModel: string }
> = {
  anthropic: {
    name: "Anthropic",
    color: "#34d07b",
    defaultModel: "claude-sonnet-4-6",
  },
  openai: {
    name: "OpenAI",
    color: "#10a37f",
    defaultModel: "gpt-4o",
  },
  gemini: {
    name: "Gemini",
    color: "#4285f4",
    defaultModel: "gemini-2.0-flash",
  },
  ollama: {
    name: "Ollama",
    color: "#9b59b6",
    defaultModel: "llama3",
  },
  mistral: {
    name: "Mistral",
    color: "#ff7000",
    defaultModel: "mistral-large-latest",
  },
};

const STORAGE_KEY = "wren:providers";

function maskKey(key: string): string {
  if (key.length <= 6) return "••••••";
  return "••••••" + key.slice(-6);
}

function loadProviders(): ProviderConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProviderConfig[];
  } catch { /* ignore */ }
  return [];
}

function saveProviders(providers: ProviderConfig[]) {
  // Never save raw keys to localStorage — only masked display info
  const safe = providers.map(({ apiKey: _, ...rest }) => rest);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
}

// ── Context ───────────────────────────────────────────────────────────────────

interface ProviderContextValue {
  providers: ProviderConfig[];
  getProvider: (id: ProviderId) => ProviderConfig | undefined;
  setProviderKey: (id: ProviderId, key: string, defaultModel?: string) => void;
  removeProviderKey: (id: ProviderId) => void;
  setProviderStatus: (id: ProviderId, status: ProviderConfig["status"]) => void;
}

const ProviderContext = createContext<ProviderContextValue | null>(null);

export function ProviderProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<ProviderConfig[]>(loadProviders);

  const getProvider = useCallback(
    (id: ProviderId) => providers.find((p) => p.id === id),
    [providers],
  );

  const setProviderKey = useCallback(
    (id: ProviderId, key: string, defaultModel?: string) => {
      setProviders((prev) => {
        const exists = prev.find((p) => p.id === id);
        const entry: ProviderConfig = exists
          ? {
              ...exists,
              apiKey: key,
              keyMasked: maskKey(key),
              defaultModel: defaultModel ?? exists.defaultModel ?? PROVIDER_META[id].defaultModel,
              status: "unchecked",
            }
          : {
              id,
              name: PROVIDER_META[id].name,
              apiKey: key,
              keyMasked: maskKey(key),
              defaultModel: defaultModel ?? PROVIDER_META[id].defaultModel,
              status: "unchecked",
            };
        const next = exists
          ? prev.map((p) => (p.id === id ? entry : p))
          : [...prev, entry];
        saveProviders(next);
        return next;
      });
    },
    [],
  );

  const removeProviderKey = useCallback((id: ProviderId) => {
    setProviders((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveProviders(next);
      return next;
    });
  }, []);

  const setProviderStatus = useCallback(
    (id: ProviderId, status: ProviderConfig["status"]) => {
      setProviders((prev) => {
        const next = prev.map((p) => (p.id === id ? { ...p, status } : p));
        saveProviders(next);
        return next;
      });
    },
    [],
  );

  return (
    <ProviderContext.Provider
      value={{ providers, getProvider, setProviderKey, removeProviderKey, setProviderStatus }}
    >
      {children}
    </ProviderContext.Provider>
  );
}

export function useProviders() {
  const ctx = useContext(ProviderContext);
  if (!ctx) throw new Error("useProviders must be used inside ProviderProvider");
  return ctx;
}
