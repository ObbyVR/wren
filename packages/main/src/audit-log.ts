import { app } from "electron";
import fs from "fs";
import path from "path";

/**
 * Append-only JSONL audit log.
 *
 * File: <userData>/wren-audit.log (+ rotated wren-audit-<ts>.log.gz not implemented
 * in v0.1 — we rotate by size only, keep N archives as plaintext).
 *
 * Size cap: ROTATE_AT_BYTES. When exceeded, the active file is renamed to
 * wren-audit-<timestamp>.log and a new active file starts.
 *
 * Older than RETENTION_MS: archives are deleted on next write.
 */

const ROTATE_AT_BYTES = 5 * 1024 * 1024; // 5 MB
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MAX_ARCHIVES = 10;

interface AuditEntry {
  timestamp: string;
  event: string;
  [k: string]: unknown;
}

let _activePath: string | null = null;

function activePath(): string {
  if (_activePath) return _activePath;
  _activePath = path.join(app.getPath("userData"), "wren-audit.log");
  return _activePath;
}

function archiveDir(): string {
  return path.dirname(activePath());
}

function needsRotate(): boolean {
  try {
    const st = fs.statSync(activePath());
    return st.size > ROTATE_AT_BYTES;
  } catch {
    return false;
  }
}

function rotate(): void {
  const active = activePath();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const archived = path.join(archiveDir(), `wren-audit-${ts}.log`);
  try {
    fs.renameSync(active, archived);
  } catch {
    // nothing to rotate
  }
}

function pruneArchives(): void {
  const dir = archiveDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => /^wren-audit-.*\.log$/.test(f));
  } catch {
    return;
  }
  const now = Date.now();
  const survivors: Array<{ file: string; mtime: number }> = [];
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const st = fs.statSync(full);
      if (now - st.mtimeMs > RETENTION_MS) {
        fs.unlinkSync(full);
        continue;
      }
      survivors.push({ file: full, mtime: st.mtimeMs });
    } catch {
      // ignore
    }
  }
  survivors.sort((a, b) => b.mtime - a.mtime);
  for (const old of survivors.slice(MAX_ARCHIVES)) {
    try {
      fs.unlinkSync(old.file);
    } catch {
      // ignore
    }
  }
}

export function auditLog(entry: { event: string; [k: string]: unknown }): void {
  const full: AuditEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  try {
    if (needsRotate()) {
      rotate();
      pruneArchives();
    }
    fs.appendFileSync(activePath(), JSON.stringify(full) + "\n", "utf-8");
  } catch {
    // audit log must never crash the app — silently drop
  }
}

/** Read the most recent N entries from the active log (tail). */
export function readAuditTail(limit = 200): AuditEntry[] {
  try {
    const raw = fs.readFileSync(activePath(), "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    const tail = lines.slice(-limit);
    return tail.map((l) => {
      try {
        return JSON.parse(l) as AuditEntry;
      } catch {
        const entry: AuditEntry = { timestamp: "", event: "parse-error", raw: l };
        return entry;
      }
    });
  } catch {
    return [];
  }
}
