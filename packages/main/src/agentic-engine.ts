import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { type BrowserWindow } from "electron";
import type {
  AgenticAction,
  AgenticActionType,
  AgenticSnapshot,
  AgenticRunCommandResult,
  AgenticSettings,
  ApprovalMode,
  FileEntry,
  AiMessage,
  AiToolCall,
  AiToolResult,
} from "@wren/shared";
import type { AIProvider, ProviderChunk } from "@wren/ai";

const execFileAsync = promisify(execFile);

const DEFAULT_SETTINGS: AgenticSettings = {
  approvalMode: "selective",
  maxActionsPerSession: 50,
  autoSnapshot: true,
};

interface ProjectAgenticState {
  snapshotStack: AgenticSnapshot[];
  actionLog: AgenticAction[];
  settings: AgenticSettings;
}

/** Resolve/reject callbacks for a pending approval */
interface PendingApproval {
  resolve: () => void;
  reject: (reason: string) => void;
}

class AgenticEngine {
  private projectStates = new Map<string, ProjectAgenticState>();
  /** Pending approvals: requestId → callbacks */
  private pendingApprovals = new Map<string, PendingApproval>();
  /** Emits an approval-request event to the renderer window */
  private emitApprovalRequest?: (data: unknown) => void;

  /** Called by the main process to wire up the push-event emitter */
  setApprovalEmitter(emitter: (data: unknown) => void): void {
    this.emitApprovalRequest = emitter;
  }

  private getState(projectId: string): ProjectAgenticState {
    if (!this.projectStates.has(projectId)) {
      this.projectStates.set(projectId, {
        snapshotStack: [],
        actionLog: [],
        settings: { ...DEFAULT_SETTINGS },
      });
    }
    return this.projectStates.get(projectId)!;
  }

  private logAction(
    projectId: string,
    action: Omit<AgenticAction, "id" | "timestamp">,
  ): AgenticAction {
    const state = this.getState(projectId);
    const entry: AgenticAction = {
      ...action,
      id: randomUUID(),
      timestamp: Date.now(),
    };
    state.actionLog.push(entry);
    return entry;
  }

  private async snapshotFile(
    projectId: string,
    filePath: string,
    type: "writeFile" | "deleteFile",
  ): Promise<string> {
    const state = this.getState(projectId);
    let originalContent: string | null = null;
    try {
      originalContent = await fs.readFile(filePath, "utf-8");
    } catch {
      originalContent = null; // file did not exist
    }
    const snapshot: AgenticSnapshot = {
      id: randomUUID(),
      type,
      path: filePath,
      originalContent,
      timestamp: Date.now(),
    };
    state.snapshotStack.push(snapshot);
    return snapshot.id;
  }

  private async applySnapshot(snapshot: AgenticSnapshot): Promise<void> {
    if (snapshot.originalContent === null) {
      // File didn't exist before the action — remove it if it was created
      try {
        await fs.unlink(snapshot.path);
      } catch {
        // ignore if already gone
      }
    } else {
      // Restore the original content
      await fs.mkdir(path.dirname(snapshot.path), { recursive: true });
      await fs.writeFile(snapshot.path, snapshot.originalContent, "utf-8");
    }
  }

  // ── Public action API ────────────────────────────────────────────────────────

  async readFile(projectId: string, filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      this.logAction(projectId, {
        type: "readFile" as AgenticActionType,
        path: filePath,
        status: "success",
      });
      return content;
    } catch (err) {
      this.logAction(projectId, {
        type: "readFile" as AgenticActionType,
        path: filePath,
        status: "error",
        error: String(err),
      });
      throw err;
    }
  }

  async writeFile(
    projectId: string,
    filePath: string,
    content: string,
  ): Promise<string> {
    const snapshotId = await this.snapshotFile(projectId, filePath, "writeFile");
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      this.logAction(projectId, {
        type: "writeFile" as AgenticActionType,
        path: filePath,
        snapshotId,
        status: "success",
      });
      return snapshotId;
    } catch (err) {
      this.logAction(projectId, {
        type: "writeFile" as AgenticActionType,
        path: filePath,
        snapshotId,
        status: "error",
        error: String(err),
      });
      throw err;
    }
  }

  async deleteFile(projectId: string, filePath: string): Promise<string> {
    const snapshotId = await this.snapshotFile(
      projectId,
      filePath,
      "deleteFile",
    );
    try {
      await fs.unlink(filePath);
      this.logAction(projectId, {
        type: "deleteFile" as AgenticActionType,
        path: filePath,
        snapshotId,
        status: "success",
      });
      return snapshotId;
    } catch (err) {
      this.logAction(projectId, {
        type: "deleteFile" as AgenticActionType,
        path: filePath,
        snapshotId,
        status: "error",
        error: String(err),
      });
      throw err;
    }
  }

  async runCommand(
    projectId: string,
    command: string,
    cwd?: string,
  ): Promise<AgenticRunCommandResult> {
    const shell =
      process.env.SHELL ||
      (process.platform === "win32" ? "cmd.exe" : "/bin/sh");
    try {
      const { stdout, stderr } = await execFileAsync(shell, ["-c", command], {
        cwd,
        timeout: 30_000,
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });
      const result: AgenticRunCommandResult = {
        stdout: stdout || "",
        stderr: stderr || "",
        exitCode: 0,
      };
      this.logAction(projectId, {
        type: "runCommand" as AgenticActionType,
        command,
        status: "success",
      });
      return result;
    } catch (err: unknown) {
      const execErr = err as {
        stdout?: string;
        stderr?: string;
        code?: number;
      };
      const result: AgenticRunCommandResult = {
        stdout: execErr.stdout ?? "",
        stderr: execErr.stderr ?? String(err),
        exitCode: typeof execErr.code === "number" ? execErr.code : 1,
      };
      this.logAction(projectId, {
        type: "runCommand" as AgenticActionType,
        command,
        status: "error",
        error: result.stderr || `exit code ${result.exitCode}`,
      });
      return result;
    }
  }

  async listDir(projectId: string, dirPath: string): Promise<FileEntry[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const result: FileEntry[] = entries.map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory(),
      }));
      result.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      this.logAction(projectId, {
        type: "listDir" as AgenticActionType,
        path: dirPath,
        status: "success",
      });
      return result;
    } catch (err) {
      this.logAction(projectId, {
        type: "listDir" as AgenticActionType,
        path: dirPath,
        status: "error",
        error: String(err),
      });
      throw err;
    }
  }

  // ── Rollback ─────────────────────────────────────────────────────────────────

  async rollback(
    projectId: string,
  ): Promise<{ snapshotId: string; path: string }> {
    const state = this.getState(projectId);
    const snapshot = state.snapshotStack.pop();
    if (!snapshot) throw new Error("No snapshot available to rollback");
    await this.applySnapshot(snapshot);
    this.logAction(projectId, {
      type: "rollback" as AgenticActionType,
      path: snapshot.path,
      snapshotId: snapshot.id,
      status: "success",
    });
    return { snapshotId: snapshot.id, path: snapshot.path };
  }

  async rollbackTo(
    projectId: string,
    snapshotId: string,
  ): Promise<{ restoredCount: number }> {
    const state = this.getState(projectId);
    const idx = state.snapshotStack.findIndex((s) => s.id === snapshotId);
    if (idx === -1) throw new Error(`Snapshot ${snapshotId} not found`);
    // Roll back from the top of the stack down to (and including) the target
    const toRestore = state.snapshotStack.splice(idx);
    for (const snapshot of toRestore.reverse()) {
      await this.applySnapshot(snapshot);
    }
    this.logAction(projectId, {
      type: "rollback" as AgenticActionType,
      snapshotId,
      status: "success",
    });
    return { restoredCount: toRestore.length };
  }

  // ── Log ──────────────────────────────────────────────────────────────────────

  getLog(projectId: string): AgenticAction[] {
    return this.getState(projectId).actionLog;
  }

  clearLog(projectId: string): void {
    this.getState(projectId).actionLog = [];
  }

  // ── Approval mode ────────────────────────────────────────────────────────────

  getApprovalMode(projectId: string): ApprovalMode {
    return this.getState(projectId).settings.approvalMode;
  }

  setApprovalMode(projectId: string, mode: ApprovalMode): void {
    this.getState(projectId).settings.approvalMode = mode;
  }

  // ── Settings ─────────────────────────────────────────────────────────────────

  getSettings(projectId: string): AgenticSettings {
    return { ...this.getState(projectId).settings };
  }

  setSettings(projectId: string, patch: Partial<AgenticSettings>): AgenticSettings {
    const state = this.getState(projectId);
    state.settings = { ...state.settings, ...patch };
    return { ...state.settings };
  }

  // ── Approval request/response ────────────────────────────────────────────────

  /**
   * Request approval for an action. Returns a promise that resolves if approved,
   * rejects if the user declines. In "auto" mode, resolves immediately.
   */
  async requestApproval(
    projectId: string,
    params: {
      action: AgenticActionType;
      path?: string;
      command?: string;
      diff?: string;
    },
  ): Promise<void> {
    const mode = this.getApprovalMode(projectId);
    if (mode === "auto") return; // no approval needed

    const requestId = randomUUID();
    const approvalData = { requestId, projectId, ...params };
    this.emitApprovalRequest?.(approvalData);

    return new Promise<void>((resolve, reject) => {
      this.pendingApprovals.set(requestId, {
        resolve,
        reject: (reason) => reject(new Error(reason)),
      });
    });
  }

  approve(requestId: string): void {
    const pending = this.pendingApprovals.get(requestId);
    if (pending) {
      this.pendingApprovals.delete(requestId);
      pending.resolve();
    }
  }

  reject(requestId: string, reason = "Rejected by user"): void {
    const pending = this.pendingApprovals.get(requestId);
    if (pending) {
      this.pendingApprovals.delete(requestId);
      pending.reject(reason);
    }
  }
}

export const agenticEngine = new AgenticEngine();

// ── Context injection ─────────────────────────────────────────────────────────

const CONTEXT_BUDGET_CHARS = 12_000;

/** Build a system prompt that injects project context for agentic mode. */
export async function buildAgenticSystemPrompt(
  projectRoot: string,
  openFiles: string[]
): Promise<string> {
  const parts: string[] = [
    "You are Wren, an AI coding assistant with the ability to read and modify files in the user's project.",
    "You have access to tools: read_file, write_file, delete_file, list_directory, run_command.",
    "Use tools to understand and modify the codebase. Always read a file before modifying it.",
    "Be precise and minimal — only change what is necessary.",
    "",
  ];

  let budget = CONTEXT_BUDGET_CHARS;

  // Project file tree (top-level only, skip hidden & node_modules)
  try {
    const entries = await fs.readdir(projectRoot, { withFileTypes: true });
    const tree = entries
      .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join("\n");
    const block = `## Project: ${path.basename(projectRoot)}\n\`\`\`\n${tree}\n\`\`\`\n`;
    if (budget > block.length) {
      parts.push(block);
      budget -= block.length;
    }
  } catch {
    // non-fatal
  }

  // package.json summary
  try {
    const pkgPath = path.join(projectRoot, "package.json");
    const raw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const summary = JSON.stringify(
      { name: pkg.name, version: pkg.version, scripts: pkg.scripts },
      null,
      2
    );
    const block = `## package.json\n\`\`\`json\n${summary}\n\`\`\`\n`;
    if (budget > block.length) {
      parts.push(block);
      budget -= block.length;
    }
  } catch {
    // no package.json
  }

  // Currently open files (up to 5, truncated to 2000 chars each)
  for (const filePath of openFiles.slice(0, 5)) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const relative = path.relative(projectRoot, filePath);
      const block = `## Open: ${relative}\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\`\n`;
      if (budget > block.length) {
        parts.push(block);
        budget -= block.length;
      }
    } catch {
      // skip unreadable
    }
  }

  return parts.join("\n");
}

// ── Agentic loop ──────────────────────────────────────────────────────────────

const MAX_AGENTIC_ITERATIONS = 10;

/** Resolve a possibly-relative path against the project root. */
function resolveToolPath(projectRoot: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
}

/** Execute a single tool call using the agenticEngine. */
async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  projectRoot: string
): Promise<{ output: string; isError: boolean }> {
  // Use a stable fake projectId based on the root path for snapshot tracking
  const projectId = Buffer.from(projectRoot).toString("base64").slice(0, 16);

  try {
    switch (toolName) {
      case "read_file": {
        const resolved = resolveToolPath(projectRoot, input.path as string);
        const content = await agenticEngine.readFile(projectId, resolved);
        return { output: content, isError: false };
      }
      case "write_file": {
        const resolved = resolveToolPath(projectRoot, input.path as string);
        await agenticEngine.writeFile(projectId, resolved, input.content as string);
        return { output: `Written: ${resolved}`, isError: false };
      }
      case "delete_file": {
        const resolved = resolveToolPath(projectRoot, input.path as string);
        await agenticEngine.deleteFile(projectId, resolved);
        return { output: `Deleted: ${resolved}`, isError: false };
      }
      case "list_directory": {
        const resolved = resolveToolPath(projectRoot, input.path as string);
        const entries = await agenticEngine.listDir(projectId, resolved);
        return { output: JSON.stringify(entries, null, 2), isError: false };
      }
      case "run_command": {
        const cwd = input.cwd
          ? resolveToolPath(projectRoot, input.cwd as string)
          : projectRoot;
        const result = await agenticEngine.runCommand(
          projectId,
          input.command as string,
          cwd
        );
        const out = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
        return { output: out || `(exit ${result.exitCode})`, isError: result.exitCode !== 0 };
      }
      default:
        return { output: `Unknown tool: ${toolName}`, isError: true };
    }
  } catch (err) {
    return {
      output: err instanceof Error ? err.message : String(err),
      isError: true,
    };
  }
}

/**
 * Run the full agentic loop:
 *   1. Send conversation to the provider (with WREN_TOOLS enabled)
 *   2. If the provider emits tool calls, execute them and inject results
 *   3. Repeat until the provider responds with text only (or MAX_ITERATIONS)
 *
 * Streams text chunks and tool events to the renderer window.
 */
export async function executeAgenticLoop(
  requestId: string,
  messages: AiMessage[],
  provider: AIProvider,
  options: { model: string; systemPrompt?: string; maxTokens?: number },
  projectRoot: string,
  win: BrowserWindow | null
): Promise<{ inputTokens: number; outputTokens: number }> {
  const { WREN_TOOLS } = await import("@wren/ai");

  const conversation: AiMessage[] = [...messages];
  let totalInput = 0;
  let totalOutput = 0;

  for (let iteration = 0; iteration < MAX_AGENTIC_ITERATIONS; iteration++) {
    const toolCalls: AiToolCall[] = [];

    const usage = await provider.sendMessage(
      conversation,
      { ...options, tools: WREN_TOOLS },
      (chunk: ProviderChunk) => {
        if (chunk.type === "text") {
          win?.webContents.send("ai:stream-chunk", { requestId, text: chunk.text });
        } else if (chunk.type === "tool_call") {
          toolCalls.push(chunk.toolCall);
          win?.webContents.send("ai:stream-tool-call", { requestId, toolCall: chunk.toolCall });
        }
      }
    );

    totalInput += usage.inputTokens;
    totalOutput += usage.outputTokens;

    // No tool calls → AI is done
    if (toolCalls.length === 0) break;

    // Execute each tool and collect results
    const toolResults: AiToolResult[] = [];
    for (const tc of toolCalls) {
      const { output, isError } = await executeToolCall(tc.name, tc.input, projectRoot);
      const toolResult: AiToolResult = {
        toolCallId: tc.id,
        name: tc.name,
        output,
        isError,
      };
      toolResults.push(toolResult);
      win?.webContents.send("ai:stream-tool-result", { requestId, toolResult });
    }

    // Inject tool results as a structured user turn so any provider understands
    const toolResultsContent = toolResults
      .map(
        (r) =>
          `<tool_result tool_call_id="${r.toolCallId}" name="${r.name}"${r.isError ? ' is_error="true"' : ""}>\n${r.output}\n</tool_result>`
      )
      .join("\n\n");

    conversation.push({ role: "user", content: toolResultsContent });
  }

  return { inputTokens: totalInput, outputTokens: totalOutput };
}
