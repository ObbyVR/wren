import { app, BrowserWindow, ipcMain, dialog, type IpcMainInvokeEvent } from "electron";
import path from "path";
import fs from "fs/promises";
import type { IpcChannelMap, FileEntry } from "@wren/shared";
import type * as nodePtyTypes from "node-pty";
import { registerAiHandlers } from "./ai-handlers";
import { projectStore } from "./project-store";
import { BridgeManager } from "./bridge-manager";
import { agenticEngine } from "./agentic-engine";
import { registerGitHandlers } from "./git-handlers";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pty: typeof import("node-pty") = require("node-pty");

const isDev = process.env.NODE_ENV === "development";

// Active PTY processes keyed by id
const terminals = new Map<string, nodePtyTypes.IPty>();
let terminalCounter = 0;
let mainWindow: BrowserWindow | null = null;

const bridgeManager = new BridgeManager({ getWindow: () => mainWindow });

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../../preload/dist/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // node-pty requires sandbox disabled
    },
  });

  mainWindow = win;

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../../renderer/dist/index.html"));
  }

  win.on("closed", () => {
    mainWindow = null;
    // Kill all terminals
    for (const [, terminal] of terminals) {
      try { terminal.kill(); } catch { /* ignore */ }
    }
    terminals.clear();
  });

  return win;
}

function registerHandlers(): void {
  const handle = <C extends keyof IpcChannelMap>(
    channel: C,
    handler: (
      event: IpcMainInvokeEvent,
      payload: IpcChannelMap[C]["request"],
    ) => Promise<IpcChannelMap[C]["response"]> | IpcChannelMap[C]["response"],
  ) => {
    ipcMain.handle(channel, handler);
  };

  handle("app:get-version", () => app.getVersion());
  handle("app:ping", (_event, message) => `pong: ${message}`);

  // Filesystem handlers
  handle("fs:readdir", async (_event, dirPath) => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result: FileEntry[] = entries.map((e) => ({
      name: e.name,
      path: path.join(dirPath, e.name),
      isDirectory: e.isDirectory(),
    }));
    // Sort: directories first, then files
    result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return result;
  });

  handle("fs:readfile", async (_event, filePath) => {
    return fs.readFile(filePath, "utf-8");
  });

  handle("fs:writefile", async (_event, { path: filePath, content }) => {
    await fs.writeFile(filePath, content, "utf-8");
  });

  // Terminal (PTY) handlers
  handle("terminal:create", (_event, { cwd }) => {
    const id = `term-${++terminalCounter}`;
    const shell =
      process.env.SHELL ||
      (process.platform === "win32" ? "powershell.exe" : "/bin/bash");

    const term = pty.spawn(shell, [], {
      name: "xterm-color",
      cols: 120,
      rows: 30,
      cwd,
      env: { ...process.env },
    });

    term.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("terminal:data", id, data);
      }
    });

    term.onExit(({ exitCode }) => {
      terminals.delete(id);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("terminal:exit", id, exitCode);
      }
    });

    terminals.set(id, term);
    return { id };
  });

  handle("terminal:input", (_event, { id, data }) => {
    const term = terminals.get(id);
    if (term) term.write(data);
  });

  handle("terminal:resize", (_event, { id, cols, rows }) => {
    const term = terminals.get(id);
    if (term) term.resize(cols, rows);
  });

  handle("terminal:destroy", (_event, { id }) => {
    const term = terminals.get(id);
    if (term) {
      try { term.kill(); } catch { /* ignore */ }
      terminals.delete(id);
    }
  });

  // AI handlers
  registerAiHandlers(handle, () => mainWindow);

  // Project management handlers
  handle("project:open", (_event, { path: folderPath }) => {
    return projectStore.open(folderPath);
  });

  handle("project:close", (_event, { id }) => {
    projectStore.close(id);
  });

  handle("project:list", () => {
    return projectStore.list();
  });

  handle("project:update", (_event, { id, activeFile, openFiles, model }) => {
    return projectStore.update(id, {
      ...(activeFile !== undefined ? { activeFile } : {}),
      ...(openFiles !== undefined ? { openFiles } : {}),
      ...(model !== undefined ? { model } : {}),
    });
  });

  // System dialog handlers
  handle("dialog:open-folder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // Agentic Engine handlers
  handle("agentic:readFile", (_event, { projectId, path: filePath }) => {
    return agenticEngine.readFile(projectId, filePath);
  });

  handle("agentic:writeFile", async (_event, { projectId, path: filePath, content }) => {
    const snapshotId = await agenticEngine.writeFile(projectId, filePath, content);
    return { snapshotId };
  });

  handle("agentic:deleteFile", async (_event, { projectId, path: filePath }) => {
    const snapshotId = await agenticEngine.deleteFile(projectId, filePath);
    return { snapshotId };
  });

  handle("agentic:runCommand", (_event, { projectId, command, cwd }) => {
    return agenticEngine.runCommand(projectId, command, cwd);
  });

  handle("agentic:listDir", (_event, { projectId, path: dirPath }) => {
    return agenticEngine.listDir(projectId, dirPath);
  });

  handle("agentic:rollback", (_event, { projectId }) => {
    return agenticEngine.rollback(projectId);
  });

  handle("agentic:rollbackTo", (_event, { projectId, snapshotId }) => {
    return agenticEngine.rollbackTo(projectId, snapshotId);
  });

  handle("agentic:get-log", (_event, { projectId }) => {
    return agenticEngine.getLog(projectId);
  });

  handle("agentic:clear-log", (_event, { projectId }) => {
    agenticEngine.clearLog(projectId);
  });

  handle("agentic:get-approval-mode", (_event, { projectId }) => {
    return agenticEngine.getApprovalMode(projectId);
  });

  handle("agentic:set-approval-mode", (_event, { projectId, mode }) => {
    agenticEngine.setApprovalMode(projectId, mode);
    // Also persist in project-store so it survives restarts
    try {
      projectStore.update(projectId, { approvalMode: mode });
    } catch {
      // project may not be in store if called before open — engine state is source of truth
    }
  });

  handle("agentic:get-settings", (_event, { projectId }) => {
    return agenticEngine.getSettings(projectId);
  });

  handle("agentic:set-settings", (_event, { projectId, settings }) => {
    const updated = agenticEngine.setSettings(projectId, settings);
    // Keep project-store in sync for approvalMode
    if (settings.approvalMode !== undefined) {
      try {
        projectStore.update(projectId, { approvalMode: settings.approvalMode });
      } catch { /* ignore */ }
    }
    return updated;
  });

  handle("agentic:approve", (_event, { requestId }) => {
    agenticEngine.approve(requestId);
  });

  handle("agentic:reject", (_event, { requestId }) => {
    agenticEngine.reject(requestId);
  });

  // Git handlers
  registerGitHandlers(handle, () => mainWindow);

  // Browser Bridge (Nexus Bridge) handlers
  handle("bridge:open-preview", (_event, payload) => {
    return bridgeManager.openPreview(payload);
  });

  handle("bridge:close-preview", (_event, { wrenWindowId }) => {
    bridgeManager.closePreview(wrenWindowId);
  });

  handle("bridge:resize-preview", (_event, payload) => {
    bridgeManager.resizePreview(payload);
  });

  handle("bridge:navigate-preview", (_event, { wrenWindowId, url }) => {
    bridgeManager.navigatePreview(wrenWindowId, url);
  });

  handle("bridge:get-status", () => {
    return bridgeManager.getStatus();
  });

  handle("bridge:list-windows", () => {
    return bridgeManager.listWindows();
  });

  handle("bridge:reload-preview", (_event, { wrenWindowId }) => {
    bridgeManager.reloadPreview(wrenWindowId);
  });
}

// Wire up approval-request emitter after window is created
function wireAgenticEmitter(): void {
  agenticEngine.setApprovalEmitter((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("agentic:approval-request", data);
    }
  });
}

app.whenReady().then(() => {
  registerHandlers();
  bridgeManager.start();
  createWindow();
  wireAgenticEmitter();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
