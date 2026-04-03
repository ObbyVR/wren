import { app, BrowserWindow, ipcMain, dialog, type IpcMainInvokeEvent } from "electron";
import path from "path";
import fs from "fs/promises";
import type { IpcChannelMap, FileEntry } from "@wren/shared";
import type * as nodePtyTypes from "node-pty";
import { registerAiHandlers } from "./ai-handlers";
import { projectStore } from "./project-store";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pty: typeof import("node-pty") = require("node-pty");

const isDev = process.env.NODE_ENV === "development";

// Active PTY processes keyed by id
const terminals = new Map<string, nodePtyTypes.IPty>();
let terminalCounter = 0;
let mainWindow: BrowserWindow | null = null;

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
}

app.whenReady().then(() => {
  registerHandlers();
  createWindow();

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
