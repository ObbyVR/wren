import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import type { IpcChannelMap } from "@wren/shared";

const isDev = process.env.NODE_ENV === "development";

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../../preload/dist/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../../renderer/dist/index.html"));
  }

  return win;
}

// Register type-safe IPC handlers
function registerHandlers(): void {
  const handle = <C extends keyof IpcChannelMap>(
    channel: C,
    handler: (
      event: Electron.IpcMainInvokeEvent,
      payload: IpcChannelMap[C]["request"],
    ) => Promise<IpcChannelMap[C]["response"]> | IpcChannelMap[C]["response"],
  ) => {
    ipcMain.handle(channel, handler);
  };

  handle("app:get-version", () => app.getVersion());

  handle("app:ping", (_event, message) => `pong: ${message}`);
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
