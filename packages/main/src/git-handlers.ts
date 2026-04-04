/**
 * Git IPC handlers for Wren IDE.
 *
 * Implements: status, diff, stage/unstage, commit, push, pull, fetch,
 * branch operations, log, stash, clone, and GitHub OAuth device flow.
 *
 * Uses simple-git for local operations and the GitHub OAuth device flow
 * for authentication (no client secret required in device flow).
 */

import { shell } from "electron";
import { simpleGit } from "simple-git";
import type { FileStatusResult, DefaultLogFields } from "simple-git";
import https from "https";
import type { IpcMainInvokeEvent, BrowserWindow } from "electron";
import type {
  IpcChannelMap,
  GitStatus,
  GitFileEntry,
  GitFileStatus,
  GitDiff,
  GitDiffFile,
  GitDiffHunk,
  BranchInfo,
  CommitResult,
  GitLogEntry,
  GitCloneResult,
  GitOAuthStatus,
} from "@wren/shared";

// ── Types ──────────────────────────────────────────────────────────────────────

type HandleFn = <C extends keyof IpcChannelMap>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    payload: IpcChannelMap[C]["request"],
  ) => Promise<IpcChannelMap[C]["response"]> | IpcChannelMap[C]["response"],
) => void;

// ── GitHub OAuth helpers ───────────────────────────────────────────────────────

// Default GitHub OAuth App client ID (public device-flow client).
const DEFAULT_GITHUB_CLIENT_ID = "Ov23liHxiXAyp5eMCJx5";

interface OAuthToken {
  accessToken: string;
  tokenType: string;
  scope: string;
}

// Persisted in-process only (not written to disk — user must re-auth on restart).
let cachedOAuthToken: OAuthToken | null = null;
let cachedGitHubUsername: string | null = null;
let cachedGitHubAvatar: string | null = null;

async function jsonPost<T>(
  hostname: string,
  path: string,
  body: Record<string, string>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk: string) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(buf) as T);
          } catch {
            reject(new Error(`Failed to parse response: ${buf}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function jsonGet<T>(
  hostname: string,
  apiPath: string,
  token: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: apiPath,
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "WrenIDE/0.1",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk: string) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(buf) as T);
          } catch {
            reject(new Error(`Failed to parse response: ${buf}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ── Diff parser ────────────────────────────────────────────────────────────────

function parseDiff(rawDiff: string): GitDiff {
  const files: GitDiffFile[] = [];
  if (!rawDiff.trim()) return { files };

  const fileSections = rawDiff.split(/^diff --git /m).slice(1);

  for (const section of fileSections) {
    const lines = section.split("\n");
    const headerLine = lines[0] ?? "";
    const match = headerLine.match(/^a\/(.*) b\/(.*)$/);
    const filePath = match ? match[2] : headerLine;

    const hunks: GitDiffHunk[] = [];
    let currentHunk: GitDiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines.slice(1)) {
      if (line.startsWith("@@")) {
        const hunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunkMatch) {
          oldLine = parseInt(hunkMatch[1], 10);
          newLine = parseInt(hunkMatch[2], 10);
        }
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
      } else if (currentHunk) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          currentHunk.lines.push({
            type: "add",
            content: line.slice(1),
            newLineNo: newLine++,
          });
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          currentHunk.lines.push({
            type: "remove",
            content: line.slice(1),
            oldLineNo: oldLine++,
          });
        } else if (
          !line.startsWith("\\") &&
          !line.startsWith("---") &&
          !line.startsWith("+++")
        ) {
          currentHunk.lines.push({
            type: "context",
            content: line.slice(1),
            oldLineNo: oldLine++,
            newLineNo: newLine++,
          });
        }
      }
    }

    if (filePath) {
      files.push({ path: filePath, hunks });
    }
  }

  return { files };
}

// ── Status mapper ──────────────────────────────────────────────────────────────

function gitIndexToStatus(index: string): GitFileStatus {
  switch (index) {
    case "A": return "added";
    case "D": return "deleted";
    case "R": return "renamed";
    case "C": return "copied";
    case "U": return "conflicted";
    default:  return "modified";
  }
}

function mapFileEntry(f: FileStatusResult, staged: boolean): GitFileEntry {
  const base: GitFileEntry = {
    path: f.path,
    status: gitIndexToStatus(staged ? f.index : f.working_dir),
    staged,
  };
  if (f.from !== undefined) {
    return { ...base, oldPath: f.from };
  }
  return base;
}

// ── Register all git handlers ──────────────────────────────────────────────────

export function registerGitHandlers(
  handle: HandleFn,
  getWindow: () => BrowserWindow | null,
): void {
  // git:status
  handle("git:status", async (_event, { repoPath }) => {
    try {
      const git = simpleGit(repoPath);
      const s = await git.status();

      const filesSeen = new Set<string>();
      const files: GitFileEntry[] = [];

      for (const f of s.files) {
        // Staged changes (index column is not '?' and not ' ')
        if (f.index !== " " && f.index !== "?" && f.index !== "!") {
          files.push(mapFileEntry(f, true));
          filesSeen.add(`staged:${f.path}`);
        }
        // Unstaged changes (working_dir column)
        if (f.working_dir !== " " && f.working_dir !== "?" && f.working_dir !== "!") {
          if (!filesSeen.has(`unstaged:${f.path}`)) {
            files.push(mapFileEntry({ ...f, index: f.working_dir }, false));
            filesSeen.add(`unstaged:${f.path}`);
          }
        }
        // Untracked
        if (f.index === "?" && f.working_dir === "?") {
          if (!filesSeen.has(`untracked:${f.path}`)) {
            files.push({ path: f.path, status: "untracked", staged: false });
            filesSeen.add(`untracked:${f.path}`);
          }
        }
      }

      const result: GitStatus = {
        branch: s.current ?? "HEAD",
        ahead: s.ahead,
        behind: s.behind,
        files,
        isRepo: true,
        ...(s.tracking ? { tracking: s.tracking } : {}),
      };
      return result;
    } catch {
      return { branch: "", ahead: 0, behind: 0, files: [], isRepo: false };
    }
  });

  // git:diff
  handle("git:diff", async (_event, { repoPath, staged, filePath }) => {
    const git = simpleGit(repoPath);
    const args: string[] = staged ? ["--cached"] : [];
    if (filePath) args.push("--", filePath);
    const rawDiff = await git.diff(args);
    return parseDiff(rawDiff);
  });

  // git:stage
  handle("git:stage", async (_event, { repoPath, paths }) => {
    const git = simpleGit(repoPath);
    await git.add(paths);
  });

  // git:unstage
  handle("git:unstage", async (_event, { repoPath, paths }) => {
    const git = simpleGit(repoPath);
    await git.reset(["HEAD", "--", ...paths]);
  });

  // git:commit
  handle("git:commit", async (_event, { repoPath, message }) => {
    const git = simpleGit(repoPath);
    const commitResult = await git.commit(message);
    const log = await git.log({ maxCount: 1 });
    const entry = log.latest as DefaultLogFields | null;
    const result: CommitResult = {
      hash: entry?.hash ?? commitResult.commit,
      message,
      author: entry?.author_name ?? "",
      timestamp: entry?.date ? new Date(entry.date).getTime() : Date.now(),
    };
    return result;
  });

  // git:push
  handle("git:push", async (_event, { repoPath, remote = "origin", branch, force }) => {
    const git = simpleGit(repoPath);
    const args: string[] = [remote];
    if (branch) args.push(branch);
    if (force) args.push("--force");
    await git.push(args);
  });

  // git:pull
  handle("git:pull", async (_event, { repoPath, remote = "origin", branch }) => {
    const git = simpleGit(repoPath);
    const result = await git.pull(remote, branch);
    return { mergeResult: String(result.summary.changes) };
  });

  // git:fetch
  handle("git:fetch", async (_event, { repoPath, remote }) => {
    const git = simpleGit(repoPath);
    if (remote) {
      await git.fetch(remote);
    } else {
      await git.fetch();
    }
  });

  // git:list-branches
  handle("git:list-branches", async (_event, { repoPath, includeRemote }) => {
    const git = simpleGit(repoPath);
    const args = includeRemote ? ["-a"] : [];
    const result = await git.branch(args);
    const branches: BranchInfo[] = Object.values(result.branches).map((data) => ({
      name: data.name,
      isCurrent: data.current,
      isRemote: data.name.startsWith("remotes/"),
      lastCommit: data.commit,
    }));
    return branches;
  });

  // git:create-branch
  handle("git:create-branch", async (_event, { repoPath, name, startPoint }) => {
    const git = simpleGit(repoPath);
    if (startPoint) {
      await git.checkoutBranch(name, startPoint);
    } else {
      await git.checkoutLocalBranch(name);
    }
  });

  // git:switch-branch
  handle("git:switch-branch", async (_event, { repoPath, name }) => {
    const git = simpleGit(repoPath);
    await git.checkout(name);
  });

  // git:delete-branch
  handle("git:delete-branch", async (_event, { repoPath, name, force }) => {
    const git = simpleGit(repoPath);
    const flag = force ? "-D" : "-d";
    await git.branch([flag, name]);
  });

  // git:log
  handle("git:log", async (_event, { repoPath, maxCount = 50, branch }) => {
    const git = simpleGit(repoPath);
    const opts: { maxCount?: number; from?: string } = { maxCount };
    if (branch) opts.from = branch;
    const log = await git.log(opts);
    return log.all.map((entry: DefaultLogFields): GitLogEntry => ({
      hash: entry.hash,
      shortHash: entry.hash.slice(0, 7),
      message: entry.message,
      author: entry.author_name,
      date: entry.date,
    }));
  });

  // git:clone
  handle("git:clone", async (_event, { repoUrl, destPath, depth }) => {
    const git = simpleGit();
    const args = depth ? ["--depth", String(depth)] : [];
    await git.clone(repoUrl, destPath, args);
    const repoName = destPath.split("/").pop() ?? destPath;
    const result: GitCloneResult = { path: destPath, repoName };
    return result;
  });

  // git:stash
  handle("git:stash", async (_event, { repoPath, message }) => {
    const git = simpleGit(repoPath);
    const args = message ? ["push", "-m", message] : ["push"];
    await git.stash(args);
  });

  // git:stash-pop
  handle("git:stash-pop", async (_event, { repoPath }) => {
    const git = simpleGit(repoPath);
    await git.stash(["pop"]);
  });

  // ── GitHub OAuth — device flow ──────────────────────────────────────────────

  // git:oauth-start — request device code from GitHub and open browser
  handle("git:oauth-start", async (_event, { clientId }) => {
    const id = clientId ?? DEFAULT_GITHUB_CLIENT_ID;

    type DeviceCodeResponse = {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
    };

    const resp = await jsonPost<DeviceCodeResponse>(
      "github.com",
      "/login/device/code",
      {
        client_id: id,
        scope: "repo read:user user:email",
      },
    );

    // Notify renderer (to show user code in UI)
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("git:oauth-browser-open", {
        url: resp.verification_uri,
        userCode: resp.user_code,
      });
    }
    // Open browser for user to authorise
    await shell.openExternal(resp.verification_uri);

    return {
      deviceCode: resp.device_code,
      userCode: resp.user_code,
      verificationUri: resp.verification_uri,
      expiresIn: resp.expires_in,
      interval: resp.interval,
    };
  });

  // git:oauth-poll — poll for token after user authorises
  handle("git:oauth-poll", async (_event, { deviceCode }) => {
    type TokenResponse = {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
    };

    const resp = await jsonPost<TokenResponse>(
      "github.com",
      "/login/oauth/access_token",
      {
        client_id: DEFAULT_GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
    );

    if (resp.access_token) {
      cachedOAuthToken = {
        accessToken: resp.access_token,
        tokenType: resp.token_type ?? "bearer",
        scope: resp.scope ?? "",
      };

      type UserInfo = { login: string; avatar_url: string };
      try {
        const user = await jsonGet<UserInfo>(
          "api.github.com",
          "/user",
          resp.access_token,
        );
        cachedGitHubUsername = user.login;
        cachedGitHubAvatar = user.avatar_url;
      } catch {
        // non-fatal — proceed without user info
      }

      const status: GitOAuthStatus = {
        authenticated: true,
        ...(cachedGitHubUsername ? { username: cachedGitHubUsername } : {}),
        ...(cachedGitHubAvatar ? { avatarUrl: cachedGitHubAvatar } : {}),
        scopes: resp.scope?.split(",") ?? [],
      };
      return status;
    }

    return { authenticated: false } satisfies GitOAuthStatus;
  });

  // git:oauth-status
  handle("git:oauth-status", () => {
    if (!cachedOAuthToken) {
      return { authenticated: false } satisfies GitOAuthStatus;
    }
    const status: GitOAuthStatus = {
      authenticated: true,
      ...(cachedGitHubUsername ? { username: cachedGitHubUsername } : {}),
      ...(cachedGitHubAvatar ? { avatarUrl: cachedGitHubAvatar } : {}),
    };
    return status;
  });

  // git:oauth-logout
  handle("git:oauth-logout", () => {
    cachedOAuthToken = null;
    cachedGitHubUsername = null;
    cachedGitHubAvatar = null;
  });
}
