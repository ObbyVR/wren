import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { ProjectTab, ProviderId } from "@wren/shared";

// ── Default mock projects (until F2.1 IPC is merged) ─────────────────────────

const STORAGE_KEY = "wren:projects";

function loadProjects(): ProjectTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProjectTab[];
  } catch { /* ignore */ }
  return [
    {
      id: "default",
      name: "Default",
      rootPath: localStorage.getItem("wren:rootPath"),
      providerId: "anthropic",
    },
  ];
}

function saveProjects(projects: ProjectTab[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

// ── Context ───────────────────────────────────────────────────────────────────

interface ProjectContextValue {
  projects: ProjectTab[];
  activeProjectId: string;
  activeProject: ProjectTab | undefined;
  setActiveProject: (id: string) => void;
  addProject: (name: string, rootPath: string | null, providerId: ProviderId) => void;
  renameProject: (id: string, name: string) => void;
  setProjectProvider: (id: string, providerId: ProviderId, modelId?: string) => void;
  closeProject: (id: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<ProjectTab[]>(loadProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>(
    () => projects[0]?.id ?? "default",
  );

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const setActiveProject = useCallback((id: string) => {
    setActiveProjectId(id);
  }, []);

  const addProject = useCallback(
    (name: string, rootPath: string | null, providerId: ProviderId) => {
      const id = `proj-${Date.now()}`;
      const next = [...projects, { id, name, rootPath, providerId }];
      setProjects(next);
      saveProjects(next);
      setActiveProjectId(id);
    },
    [projects],
  );

  const renameProject = useCallback(
    (id: string, name: string) => {
      const next = projects.map((p) => (p.id === id ? { ...p, name } : p));
      setProjects(next);
      saveProjects(next);
    },
    [projects],
  );

  const setProjectProvider = useCallback(
    (id: string, providerId: ProviderId, modelId?: string) => {
      const next = projects.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, providerId };
        if (modelId !== undefined) updated.modelId = modelId;
        return updated;
      });
      setProjects(next);
      saveProjects(next);
    },
    [projects],
  );

  const closeProject = useCallback(
    (id: string) => {
      if (projects.length <= 1) return; // keep at least one
      const next = projects.filter((p) => p.id !== id);
      setProjects(next);
      saveProjects(next);
      if (activeProjectId === id) {
        setActiveProjectId(next[0]?.id ?? "");
      }
    },
    [projects, activeProjectId],
  );

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProjectId,
        activeProject,
        setActiveProject,
        addProject,
        renameProject,
        setProjectProvider,
        closeProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjects must be used inside ProjectProvider");
  return ctx;
}
