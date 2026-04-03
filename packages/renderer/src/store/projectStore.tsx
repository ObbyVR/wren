import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { ProjectTab, ProjectInfo, ProviderId } from "@wren/shared";

// ── Default mock projects (used if IPC unavailable) ───────────────────────────

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

function projectInfoToTab(info: ProjectInfo): ProjectTab {
  return {
    id: info.id,
    name: info.name,
    rootPath: info.path || null,
    providerId: (info.aiProvider as ProviderId) || "anthropic",
    modelId: info.model,
  };
}

// ── Context ───────────────────────────────────────────────────────────────────

interface ProjectContextValue {
  projects: ProjectTab[];
  activeProjectId: string;
  activeProject: ProjectTab | undefined;
  setActiveProject: (id: string) => void;
  addProject: (name: string, rootPath: string | null, providerId: ProviderId) => void;
  openProjectFromDisk: () => Promise<void>;
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

  // On mount, try to load persisted projects from main process
  useEffect(() => {
    void window.wren.invoke("project:list").then((list) => {
      if (list.length > 0) {
        const tabs = list.map(projectInfoToTab);
        setProjects(tabs);
        saveProjects(tabs);
        setActiveProjectId((prev) =>
          tabs.some((t) => t.id === prev) ? prev : (tabs[0]?.id ?? prev),
        );
      }
    }).catch(() => { /* IPC not available (tests/storybook) */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** Open a real folder via the system dialog, then register with main process */
  const openProjectFromDisk = useCallback(async () => {
    let folderPath: string | null = null;
    try {
      folderPath = await window.wren.invoke("dialog:open-folder");
    } catch {
      // Fallback: use prompt in non-Electron contexts
      folderPath = window.prompt("Enter folder path:") ?? null;
    }
    if (!folderPath?.trim()) return;

    let projectInfo: ProjectInfo;
    try {
      projectInfo = await window.wren.invoke("project:open", { path: folderPath.trim() });
    } catch {
      // Fallback: create a local-only project
      addProject(folderPath.trim().split("/").pop() ?? "Project", folderPath.trim(), "anthropic");
      return;
    }

    const tab = projectInfoToTab(projectInfo);
    setProjects((prev) => {
      // Don't duplicate if already open
      if (prev.some((p) => p.id === tab.id)) {
        return prev;
      }
      const next = [...prev, tab];
      saveProjects(next);
      return next;
    });
    setActiveProjectId(tab.id);
  }, [addProject]);

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
      // Inform main process (fire and forget)
      void window.wren.invoke("project:close", { id }).catch(() => {});
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
        openProjectFromDisk,
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
