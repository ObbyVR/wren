import { create } from "zustand";
import type { ProjectInfo } from "@wren/shared";

interface ProjectStore {
  projects: ProjectInfo[];
  activeProjectId: string | null;

  // Actions
  setProjects: (projects: ProjectInfo[]) => void;
  addProject: (project: ProjectInfo) => void;
  removeProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  updateProject: (project: ProjectInfo) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  activeProjectId: null,

  setProjects: (projects) =>
    set((state) => ({
      projects,
      // Keep active if still present; otherwise pick first
      activeProjectId:
        state.activeProjectId && projects.some((p) => p.id === state.activeProjectId)
          ? state.activeProjectId
          : (projects[0]?.id ?? null),
    })),

  addProject: (project) =>
    set((state) => ({
      projects: [...state.projects, project],
      activeProjectId: state.activeProjectId ?? project.id,
    })),

  removeProject: (id) =>
    set((state) => {
      const remaining = state.projects.filter((p) => p.id !== id);
      let nextActive = state.activeProjectId;
      if (nextActive === id) {
        // Pick the adjacent project
        const idx = state.projects.findIndex((p) => p.id === id);
        nextActive = remaining[Math.max(0, idx - 1)]?.id ?? remaining[0]?.id ?? null;
      }
      return { projects: remaining, activeProjectId: nextActive };
    }),

  setActiveProject: (id) => set({ activeProjectId: id }),

  updateProject: (project) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === project.id ? project : p)),
    })),
}));

/** Convenience selector */
export function useActiveProject(): ProjectInfo | null {
  return useProjectStore((s) =>
    s.projects.find((p) => p.id === s.activeProjectId) ?? null,
  );
}
