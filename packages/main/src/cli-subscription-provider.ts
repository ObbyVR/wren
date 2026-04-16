/**
 * CLI Subscription Provider
 *
 * Spawns local CLI tools (Claude Code, OpenAI Codex) to use AI subscriptions
 * instead of API keys. Each CLI handles its own OAuth auth flow.
 *
 * Claude:  `claude --print - --output-format stream-json --verbose`
 * Codex:   `codex exec "<prompt>" --json`
 */

import { spawn, type ChildProcess } from "child_process";
import { accessSync, readFileSync, writeFileSync, constants } from "fs";
import path from "path";
import { app, type BrowserWindow } from "electron";

/** Wren context prefix injected into all CLI prompts */
const WREN_CONTEXT_PREFIX = `[You are inside Wren IDE. CRITICAL RULES:
1. NEVER run "open" commands, NEVER open a browser, NEVER use xdg-open or any command that opens external apps.
2. When showing anything visual, write an HTML file and include the FULL ABSOLUTE PATH in your response (e.g. /Users/name/file.html). Wren auto-opens it in Preview.
3. For running servers, just mention the http://localhost:PORT URL in text. Do NOT open it.
4. Keep responses concise.]\n\n`;

// ── CLI Configuration ────────────────────────────────────────────────────────

interface CliConfig {
  /** Common binary locations (Electron doesn't inherit user's shell PATH) */
  paths: string[];
  /** Build spawn args for a given prompt */
  buildArgs: (prompt: string, opts: CliOpts) => string[];
  /** Parse a line of stdout JSON into a stream chunk */
  parseLine: (line: string) => StreamChunk | null;
  /** Env vars to delete (force subscription billing) */
  deleteEnvKeys: string[];
  /** Pattern in stderr that indicates login is required */
  loginRequiredPattern: RegExp;
  /** Error message when login is required */
  loginErrorMessage: string;
  /** Error message when CLI is not installed */
  installMessage: string;
  /** Whether prompt is sent via stdin (true) or as arg (false) */
  promptViaStdin: boolean;
}

interface CliOpts {
  sessionId?: string | undefined;
  model?: string | undefined;
}

const CLI_CONFIGS: Record<string, CliConfig> = {
  claude: {
    paths: [
      `${process.env.HOME}/.local/bin/claude`,
      "/usr/local/bin/claude",
      `${process.env.HOME}/.claude/local/claude`,
    ],
    buildArgs: (_prompt, opts) => {
      const args = [
        "--print", "-",
        "--output-format", "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
        "--disallowed-tools", "Bash(open:*)",
      ];
      if (opts.sessionId) args.push("--resume", opts.sessionId);
      if (opts.model) args.push("--model", opts.model);
      return args;
    },
    parseLine: parseClaudeLine,
    deleteEnvKeys: ["ANTHROPIC_API_KEY"],
    loginRequiredPattern: /not\s+logged\s+in|login\s+required|please\s+log\s+in/i,
    loginErrorMessage: "Claude CLI requires login. Run 'claude login' in your terminal.",
    installMessage: "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code",
    promptViaStdin: true,
  },
  codex: {
    paths: [
      `${process.env.HOME}/.local/bin/codex`,
      `${process.env.HOME}/local-node/bin/codex`,
      `${process.env.HOME}/.local/node-v22.14.0-darwin-arm64/bin/codex`,
      "/usr/local/bin/codex",
      `${process.env.HOME}/.codex/bin/codex`,
    ],
    buildArgs: (prompt, opts) => {
      const args: string[] = ["exec"];
      if (opts.sessionId) {
        args.push("resume", opts.sessionId);
      }
      // Prepend Wren context to prompt (Codex doesn't support system prompt files)
      const wrennedPrompt = WREN_CONTEXT_PREFIX + prompt;
      args.push(wrennedPrompt, "--json", "--skip-git-repo-check", "--full-auto");
      if (opts.model && opts.model !== "default") args.push("--model", opts.model);
      return args;
    },
    parseLine: parseCodexLine,
    deleteEnvKeys: [], // Codex uses auth.json, not env vars; don't strip anything
    loginRequiredPattern: /not\s+logged\s+in|login|auth|sign\s+in/i,
    loginErrorMessage: "Codex CLI requires login. Run 'codex' and select 'Sign in with ChatGPT'.",
    installMessage: "Codex CLI not found. Install with: npm install -g @openai/codex",
    promptViaStdin: false,
  },
};

// Map ProviderId → CLI name
const PROVIDER_TO_CLI: Record<string, string> = {
  claude: "claude",
  anthropic: "claude",
  openai: "codex",
};

// ── Binary resolution ────────────────────────────────────────────────────────

function resolveBinaryPath(candidates: string[]): string | null {
  for (const p of candidates) {
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      // not found
    }
  }
  return null;
}

// ── Stream chunk types ───────────────────────────────────────────────────────

interface StreamChunk {
  type: "text" | "done" | "error";
  text?: string | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  sessionId?: string | undefined;
}

// ── Claude stream-json parser ────────────────────────────────────────────────

function parseClaudeLine(line: string): StreamChunk | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const type = String(event.type ?? "");

  if (type === "system" && String(event.subtype ?? "") === "init") {
    return { type: "text", text: "", sessionId: String(event.session_id ?? "") };
  }

  if (type === "assistant") {
    const message = event.message as Record<string, unknown> | undefined;
    if (!message) return null;
    const content = Array.isArray(message.content) ? message.content : [];
    const texts: string[] = [];
    for (const entry of content) {
      if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
        const block = entry as Record<string, unknown>;
        if (block.type === "text" && typeof block.text === "string") {
          texts.push(block.text);
        }
        // Skip thinking blocks — they contain internal reasoning, not user-facing text
      }
    }
    if (texts.length > 0) {
      return { type: "text", text: texts.join(""), sessionId: asStr(event.session_id) };
    }
    return null;
  }

  if (type === "result") {
    const usage = (event.usage ?? {}) as Record<string, unknown>;
    return {
      type: "done",
      inputTokens: Number(usage.input_tokens ?? 0),
      outputTokens: Number(usage.output_tokens ?? 0),
      sessionId: asStr(event.session_id),
    };
  }

  return null;
}

// ── Codex JSON Lines parser ──────────────────────────────────────────────────

function parseCodexLine(line: string): StreamChunk | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const type = String(event.type ?? "");

  // Codex emits: thread.started, turn.started, item.completed, turn.completed
  // thread.started has thread_id (session equivalent)
  if (type === "thread.started") {
    return { type: "text", text: "", sessionId: asStr(event.thread_id) };
  }

  // item.completed has the actual text response
  if (type === "item.completed") {
    const item = event.item as Record<string, unknown> | undefined;
    if (!item) return null;
    const text = asStr(item.text);
    if (text) return { type: "text", text };
    return null;
  }

  // turn.completed has usage stats
  if (type === "turn.completed") {
    const usage = (event.usage ?? {}) as Record<string, unknown>;
    return {
      type: "done",
      inputTokens: Number(usage.input_tokens ?? 0),
      outputTokens: Number(usage.output_tokens ?? 0),
    };
  }

  // turn.failed — propagate error
  if (type === "turn.failed" || type === "error") {
    const errMsg = typeof event.message === "string" ? event.message : "";
    const errObj = event.error as Record<string, unknown> | undefined;
    const errText = errMsg || (errObj ? String(errObj.message ?? "") : "Unknown error");
    return { type: "text", text: `Error: ${errText.slice(0, 200)}` };
  }

  return null;
}

function asStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// ── Session persistence (survives app restarts) ─────────────────────────────

function getSessionStorePath(): string {
  return path.join(app.getPath("userData"), "wren-cli-sessions.json");
}

interface SessionEntry {
  sessionId: string;
  contextSent: boolean;
}

function loadSessionStore(): Record<string, SessionEntry | string> {
  try {
    return JSON.parse(readFileSync(getSessionStorePath(), "utf-8")) as Record<string, SessionEntry | string>;
  } catch {
    return {};
  }
}

function getSessionEntry(chatSessionId: string): SessionEntry | null {
  const raw = loadSessionStore()[chatSessionId];
  if (!raw) return null;
  // Migrate old string format → new object format
  if (typeof raw === "string") return { sessionId: raw, contextSent: false };
  return raw;
}

function saveCliSession(chatSessionId: string, sessionId: string, contextSent: boolean): void {
  const store = loadSessionStore();
  store[chatSessionId] = { sessionId, contextSent };
  try {
    writeFileSync(getSessionStorePath(), JSON.stringify(store));
  } catch { /* ignore */ }
}

// ── Active process tracking (for kill on new message) ────────────────────────

const activeProcesses = new Map<string, ChildProcess>();

/**
 * Kill any running CLI process for a chat session.
 * Safe to call even if no process is running.
 */
function killActiveProcess(chatSessionId: string): void {
  const proc = activeProcesses.get(chatSessionId);
  if (proc && !proc.killed) {
    proc.kill("SIGTERM");
  }
  activeProcesses.delete(chatSessionId);
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Check if a CLI tool is available for the given provider.
 */
export function isCliAvailable(providerId: string): boolean {
  const cliName = PROVIDER_TO_CLI[providerId];
  if (!cliName) return false;
  const config = CLI_CONFIGS[cliName];
  if (!config) return false;
  return resolveBinaryPath(config.paths) !== null;
}

/**
 * Send a message using the local CLI subscription.
 * Works with Claude Code (claude) and OpenAI Codex (codex).
 */
export function sendViaCli(
  requestId: string,
  prompt: string,
  opts: {
    providerId: string;
    sessionId?: string;
    model?: string;
    cwd?: string;
    chatSessionId: string;
  },
  win: BrowserWindow | null,
): void {
  // Kill any still-running process for this session (user sent a new message)
  killActiveProcess(opts.chatSessionId);

  const cliName = PROVIDER_TO_CLI[opts.providerId];
  if (!cliName) {
    win?.webContents.send("ai:stream-error", {
      requestId,
      error: `No CLI available for provider "${opts.providerId}". Use API mode instead.`,
    });
    return;
  }

  const config = CLI_CONFIGS[cliName];
  const binaryPath = resolveBinaryPath(config.paths);
  if (!binaryPath) {
    win?.webContents.send("ai:stream-error", {
      requestId,
      error: config.installMessage,
    });
    return;
  }

  // Build session context — only send Wren prefix on first message
  const savedEntry = getSessionEntry(opts.chatSessionId);
  const cliOpts: CliOpts = {
    sessionId: opts.sessionId ?? savedEntry?.sessionId,
    model: opts.model,
  };

  const needsContext = !savedEntry?.contextSent;
  const finalPrompt = needsContext ? (WREN_CONTEXT_PREFIX + prompt) : prompt;
  const args = config.buildArgs(finalPrompt, cliOpts);

  // Build environment — strip API keys to force subscription billing
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const key of config.deleteEnvKeys) {
    delete env[key];
  }
  // Ensure node/npm binaries are in PATH (Electron strips the user's shell PATH)
  const home = process.env.HOME ?? "";
  const extraPaths = [
    `${home}/.local/bin`,
    `${home}/local-node/bin`,
    `${home}/.local/node-v22.14.0-darwin-arm64/bin`,
    "/usr/local/bin",
    `${home}/.nvm/versions/node/v22.14.0/bin`,
  ].join(":");
  env.PATH = `${extraPaths}:${env.PATH ?? "/usr/bin:/bin"}`;

  let proc: ChildProcess;
  try {
    proc = spawn(binaryPath, args, {
      cwd: opts.cwd ?? process.env.HOME,
      env,
      stdio: [config.promptViaStdin ? "pipe" : "ignore", "pipe", "pipe"],
    });
  } catch (err) {
    win?.webContents.send("ai:stream-error", {
      requestId,
      error: `Failed to spawn ${cliName}: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  // Track this process so it can be killed if user sends a new message
  activeProcesses.set(opts.chatSessionId, proc);

  // Send prompt via stdin (Claude) or as arg (Codex — already in args)
  if (config.promptViaStdin && proc.stdin) {
    proc.stdin.write(finalPrompt);
    proc.stdin.end();
  }

  // Stream processing
  let lineBuffer = "";
  let lastSessionId = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let sentText = false;

  proc.stdout?.on("data", (chunk: Buffer) => {
    const raw = chunk.toString();
    lineBuffer += raw;
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const parsed = config.parseLine(line);
      if (!parsed) {
        continue;
      }

      if (parsed.sessionId) lastSessionId = parsed.sessionId;

      if (parsed.type === "text" && parsed.text) {
        sentText = true;

        win?.webContents.send("ai:stream-chunk", { requestId, text: parsed.text });
      }

      if (parsed.type === "done") {
        totalInputTokens = parsed.inputTokens ?? 0;
        totalOutputTokens = parsed.outputTokens ?? 0;
      }
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (config.loginRequiredPattern.test(text)) {
      win?.webContents.send("ai:stream-error", { requestId, error: config.loginErrorMessage });
      proc.kill();
    }
  });

  proc.on("close", (code, signal) => {
    activeProcesses.delete(opts.chatSessionId);

    // Flush remaining buffer
    if (lineBuffer.trim()) {
      const parsed = config.parseLine(lineBuffer);
      if (parsed?.type === "text" && parsed.text) {
        win?.webContents.send("ai:stream-chunk", { requestId, text: parsed.text });
        sentText = true;
      }
      if (parsed?.type === "done") {
        totalInputTokens = parsed.inputTokens ?? 0;
        totalOutputTokens = parsed.outputTokens ?? 0;
      }
      if (parsed?.sessionId) lastSessionId = parsed.sessionId;
    }

    // Save session even if killed (preserves sessionId for --resume)
    if (lastSessionId) {
      saveCliSession(opts.chatSessionId, lastSessionId, true);
    }

    // Killed by us (new message sent) — mark as interrupted, not error
    if (signal === "SIGTERM") {
      if (sentText) {
        win?.webContents.send("ai:stream-chunk", { requestId, text: "\n\n*[interrupted]*" });
      }
      win?.webContents.send("ai:stream-done", {
        requestId,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
      return;
    }

    if (code !== 0 && !sentText) {
      win?.webContents.send("ai:stream-error", {
        requestId,
        error: `${cliName} exited with code ${code}. ${config.loginErrorMessage}`,
      });
    } else {
      win?.webContents.send("ai:stream-done", {
        requestId,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
    }
  });

  proc.on("error", (err) => {
    win?.webContents.send("ai:stream-error", {
      requestId,
      error: `${cliName} error: ${err.message}. ${config.installMessage}`,
    });
  });
}
