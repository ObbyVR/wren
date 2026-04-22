import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export interface PromptSnippet {
  id: string;
  title: string;
  body: string;
  projectId: string | undefined; // undefined = global
  updatedAt: number;
}

const STORAGE_KEY = "wren:prompt-library";

function loadSnippets(): PromptSnippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PromptSnippet[];
  } catch {
    return [];
  }
}

function saveSnippets(list: PromptSnippet[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // quota exceeded — drop silently
  }
}

function makeId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface Ctx {
  snippets: PromptSnippet[];
  addSnippet: (s: Omit<PromptSnippet, "id" | "updatedAt">) => PromptSnippet;
  updateSnippet: (id: string, patch: Partial<Omit<PromptSnippet, "id">>) => void;
  deleteSnippet: (id: string) => void;
  /** Snippets scoped to a given project plus global ones, most-recent first */
  snippetsForProject: (projectId: string | undefined) => PromptSnippet[];
}

const PromptLibraryContext = createContext<Ctx | null>(null);

export function PromptLibraryProvider({ children }: { children: ReactNode }) {
  const [snippets, setSnippets] = useState<PromptSnippet[]>(loadSnippets);

  const persist = useCallback((next: PromptSnippet[]) => {
    setSnippets(next);
    saveSnippets(next);
  }, []);

  const addSnippet = useCallback<Ctx["addSnippet"]>(
    (s) => {
      const entry: PromptSnippet = {
        id: makeId(),
        updatedAt: Date.now(),
        ...s,
      };
      persist([entry, ...snippets]);
      return entry;
    },
    [snippets, persist],
  );

  const updateSnippet = useCallback<Ctx["updateSnippet"]>(
    (id, patch) => {
      persist(
        snippets.map((s) =>
          s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
        ),
      );
    },
    [snippets, persist],
  );

  const deleteSnippet = useCallback<Ctx["deleteSnippet"]>(
    (id) => {
      persist(snippets.filter((s) => s.id !== id));
    },
    [snippets, persist],
  );

  const snippetsForProject = useCallback<Ctx["snippetsForProject"]>(
    (projectId) => {
      return snippets
        .filter((s) => !s.projectId || s.projectId === projectId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    [snippets],
  );

  return (
    <PromptLibraryContext.Provider
      value={{ snippets, addSnippet, updateSnippet, deleteSnippet, snippetsForProject }}
    >
      {children}
    </PromptLibraryContext.Provider>
  );
}

export function usePromptLibrary() {
  const ctx = useContext(PromptLibraryContext);
  if (!ctx) throw new Error("usePromptLibrary must be used inside PromptLibraryProvider");
  return ctx;
}
