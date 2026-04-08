import { app } from "electron";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ProjectInfo, ApprovalMode } from "@wren/shared";

const PROJECTS_FILE = path.join(app.getPath("userData"), "wren-projects.json");

interface PersistedProject {
  id: string;
  path: string;
  name: string;
  activeFile: string | null;
  openFiles: string[];
  aiProvider: string;
  model: string;
  approvalMode: ApprovalMode;
  /** Per-provider key alias override. E.g. { anthropic: "prod", openai: "personal" } */
  providerProfile?: Record<string, string>;
}

function readPersisted(): PersistedProject[] {
  try {
    const raw = fs.readFileSync(PROJECTS_FILE, "utf-8");
    return JSON.parse(raw) as PersistedProject[];
  } catch {
    return [];
  }
}

function writePersisted(projects: PersistedProject[]): void {
  try {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), "utf-8");
  } catch { /* ignore write errors */ }
}

function projectName(folderPath: string): string {
  return path.basename(folderPath) || folderPath;
}

class ProjectStore {
  private projects = new Map<string, ProjectInfo>();

  constructor() {
    // Restore previously open projects on startup
    const persisted = readPersisted();
    for (const p of persisted) {
      this.projects.set(p.id, { ...p, approvalMode: p.approvalMode ?? "selective" });
    }
  }

  list(): ProjectInfo[] {
    return Array.from(this.projects.values());
  }

  get(id: string): ProjectInfo | undefined {
    return this.projects.get(id);
  }

  /** Open a project by folder path. Returns existing project if already open. */
  open(folderPath: string): ProjectInfo {
    // Return existing project if already open with same path
    for (const p of this.projects.values()) {
      if (p.path === folderPath) return p;
    }

    const project: ProjectInfo = {
      id: randomUUID(),
      path: folderPath,
      name: projectName(folderPath),
      activeFile: null,
      openFiles: [],
      aiProvider: "anthropic",
      model: "claude-opus-4-6",
      approvalMode: "selective",
    };

    this.projects.set(project.id, project);
    this.persist();
    return project;
  }

  close(id: string): void {
    this.projects.delete(id);
    this.persist();
  }

  setProviderProfile(projectId: string, providerId: string, alias: string): void {
    const existing = this.projects.get(projectId);
    if (!existing) return;
    const persisted = readPersisted();
    const p = persisted.find((pp) => pp.id === projectId);
    if (p) {
      if (!p.providerProfile) p.providerProfile = {};
      p.providerProfile[providerId] = alias;
      writePersisted(persisted);
    }
  }

  getProviderAlias(projectId: string, providerId: string): string {
    const persisted = readPersisted();
    const p = persisted.find((pp) => pp.id === projectId);
    return p?.providerProfile?.[providerId] ?? "default";
  }

  update(id: string, patch: Partial<Pick<ProjectInfo, "activeFile" | "openFiles" | "model" | "approvalMode">>): ProjectInfo {
    const existing = this.projects.get(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const updated: ProjectInfo = { ...existing, ...patch };
    this.projects.set(id, updated);
    this.persist();
    return updated;
  }

  private persist(): void {
    writePersisted(Array.from(this.projects.values()));
  }
}

export const projectStore = new ProjectStore();
