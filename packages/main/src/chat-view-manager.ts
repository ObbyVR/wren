import { WebContentsView, type BrowserWindow } from "electron";
import type { ViewBounds } from "@wren/shared";

/**
 * URL map for subscription-based AI providers.
 * Each URL opens a new chat in the provider's web interface.
 */
const PROVIDER_URLS: Record<string, string> = {
  claude: "https://claude.ai/new",
  anthropic: "https://claude.ai/new",
  openai: "https://chatgpt.com",
  gemini: "https://gemini.google.com/app",
};

interface ManagedView {
  view: WebContentsView;
  bounds: ViewBounds;
  visible: boolean;
}

/**
 * Manages WebContentsView instances for embedded AI chat sessions.
 * Each session gets a separate Chromium view that loads the provider's website.
 * Cookies persist across sessions (user logs in once).
 */
export class ChatViewManager {
  private views = new Map<string, ManagedView>();
  private getWindow: () => BrowserWindow | null;

  constructor(opts: { getWindow: () => BrowserWindow | null }) {
    this.getWindow = opts.getWindow;
  }

  create(sessionId: string, providerId: string, bounds: ViewBounds): void {
    // Prevent duplicates
    if (this.views.has(sessionId)) {
      this.resize(sessionId, bounds);
      return;
    }

    const win = this.getWindow();
    if (!win) return;

    // providerId can be a provider name OR a direct URL (for Preview panel)
    const url = providerId.startsWith("http") ? providerId : (PROVIDER_URLS[providerId] ?? PROVIDER_URLS["claude"]);

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Use default session — cookies persist across app restarts
      },
    });

    // Position the view within the window
    const roundedBounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
    view.setBounds(roundedBounds);

    // Add to window's content view (on top of main webContents)
    win.contentView.addChildView(view);

    // Dark background so it doesn't flash white while loading
    view.setBackgroundColor("#1e1e1e");

    // Load the provider's URL
    view.webContents.loadURL(url);

    this.views.set(sessionId, {
      view,
      bounds: roundedBounds,
      visible: true,
    });
  }

  resize(sessionId: string, bounds: ViewBounds): void {
    const managed = this.views.get(sessionId);
    if (!managed) return;

    const roundedBounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };

    managed.bounds = roundedBounds;
    if (managed.visible) {
      managed.view.setBounds(roundedBounds);
    }
  }

  setVisible(sessionId: string, visible: boolean): void {
    const managed = this.views.get(sessionId);
    if (!managed) return;

    const win = this.getWindow();
    if (!win) return;

    managed.visible = visible;

    if (visible) {
      // Re-add to window and position
      try {
        win.contentView.addChildView(managed.view);
      } catch {
        // Already added — ignore
      }
      managed.view.setBounds(managed.bounds);
    } else {
      // Remove from window (hides without destroying)
      try {
        win.contentView.removeChildView(managed.view);
      } catch {
        // Not attached — ignore
      }
    }
  }

  destroy(sessionId: string): void {
    const managed = this.views.get(sessionId);
    if (!managed) return;

    const win = this.getWindow();
    if (win) {
      try {
        win.contentView.removeChildView(managed.view);
      } catch {
        // Not attached — ignore
      }
    }

    // Destroy the webContents
    managed.view.webContents.close();
    this.views.delete(sessionId);
  }

  destroyAll(): void {
    for (const sessionId of [...this.views.keys()]) {
      this.destroy(sessionId);
    }
  }
}
