import { app } from "electron";
import fs from "fs/promises";
import path from "path";
import type { AgenticSnapshot } from "@wren/shared";

/**
 * Durable snapshot store.
 *
 * Each snapshot is persisted as a JSON file under:
 *   <userData>/wren-snapshots/<projectId>/<snapshotId>.json
 *
 * Retention: snapshots older than RETENTION_MS are pruned lazily on
 * load/save. Default 30 days (Pro-tier feature documented on landing).
 */

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function snapshotsDir(): string {
  return path.join(app.getPath("userData"), "wren-snapshots");
}

function projectDir(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.join(snapshotsDir(), safe);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function persistSnapshot(
  projectId: string,
  snapshot: AgenticSnapshot,
): Promise<void> {
  const dir = projectDir(projectId);
  await ensureDir(dir);
  const file = path.join(dir, `${snapshot.id}.json`);
  await fs.writeFile(file, JSON.stringify(snapshot), "utf-8");
}

export async function deleteSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<void> {
  const file = path.join(projectDir(projectId), `${snapshotId}.json`);
  try {
    await fs.unlink(file);
  } catch {
    // already gone
  }
}

export async function loadSnapshots(
  projectId: string,
): Promise<AgenticSnapshot[]> {
  const dir = projectDir(projectId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const now = Date.now();
  const results: AgenticSnapshot[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(dir, name);
    try {
      const raw = await fs.readFile(file, "utf-8");
      const snap = JSON.parse(raw) as AgenticSnapshot;
      if (now - snap.timestamp > RETENTION_MS) {
        await fs.unlink(file).catch(() => {});
        continue;
      }
      results.push(snap);
    } catch {
      // corrupt file — delete
      await fs.unlink(file).catch(() => {});
    }
  }
  // Oldest first so pop() behaves like the old in-memory stack
  results.sort((a, b) => a.timestamp - b.timestamp);
  return results;
}

/** Prune snapshots older than retention across every project. */
export async function pruneOldSnapshots(): Promise<number> {
  const root = snapshotsDir();
  let projects: string[];
  try {
    projects = await fs.readdir(root);
  } catch {
    return 0;
  }
  const now = Date.now();
  let pruned = 0;
  for (const proj of projects) {
    const dir = path.join(root, proj);
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of files) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(dir, name);
      try {
        const raw = await fs.readFile(file, "utf-8");
        const snap = JSON.parse(raw) as AgenticSnapshot;
        if (now - snap.timestamp > RETENTION_MS) {
          await fs.unlink(file);
          pruned++;
        }
      } catch {
        await fs.unlink(file).catch(() => {});
      }
    }
  }
  return pruned;
}
