import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { CostEntry, ProviderId } from "@wren/shared";

// ── Cost-per-token estimates (USD per 1M tokens) ──────────────────────────────

const TOKEN_COST_PER_MILLION: Record<ProviderId, { input: number; output: number }> = {
  anthropic: { input: 3.0, output: 15.0 },
  openai: { input: 2.5, output: 10.0 },
  gemini: { input: 1.25, output: 5.0 },
  ollama: { input: 0, output: 0 },
  mistral: { input: 2.0, output: 6.0 },
};

export function estimateCost(
  providerId: ProviderId,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = TOKEN_COST_PER_MILLION[providerId] ?? { input: 0, output: 0 };
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const STORAGE_KEY = "wren:cost";

const RETENTION_DAYS = 90;

function loadEntries(): CostEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CostEntry[];
      // Discard entries older than retention window
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
      return parsed.filter((e) => new Date(e.date) >= cutoff);
    }
  } catch { /* ignore */ }
  return [];
}

function saveEntries(entries: CostEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ── Context ───────────────────────────────────────────────────────────────────

interface CostContextValue {
  entries: CostEntry[];
  recordUsage: (
    projectId: string,
    projectName: string,
    providerId: ProviderId,
    inputTokens: number,
    outputTokens: number,
  ) => void;
  todayEntries: CostEntry[];
  resetToday: () => void;
}

const CostContext = createContext<CostContextValue | null>(null);

export function CostProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<CostEntry[]>(loadEntries);

  const todayEntries = entries.filter((e) => e.date === today());

  const recordUsage = useCallback(
    (
      projectId: string,
      projectName: string,
      providerId: ProviderId,
      inputTokens: number,
      outputTokens: number,
    ) => {
      setEntries((prev) => {
        const date = today();
        const existing = prev.find(
          (e) => e.projectId === projectId && e.date === date,
        );
        let next: CostEntry[];
        if (existing) {
          next = prev.map((e) =>
            e === existing
              ? {
                  ...e,
                  inputTokens: e.inputTokens + inputTokens,
                  outputTokens: e.outputTokens + outputTokens,
                }
              : e,
          );
        } else {
          next = [
            ...prev,
            { projectId, projectName, providerId, inputTokens, outputTokens, date },
          ];
        }
        saveEntries(next);
        return next;
      });
    },
    [],
  );

  const resetToday = useCallback(() => {
    const date = today();
    setEntries((prev) => {
      const next = prev.filter((e) => e.date !== date);
      saveEntries(next);
      return next;
    });
  }, []);

  return (
    <CostContext.Provider value={{ entries, recordUsage, todayEntries, resetToday }}>
      {children}
    </CostContext.Provider>
  );
}

export function useCost() {
  const ctx = useContext(CostContext);
  if (!ctx) throw new Error("useCost must be used inside CostProvider");
  return ctx;
}
