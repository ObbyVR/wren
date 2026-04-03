/**
 * Wren Nexus Bridge — Background Service Worker (Manifest V3)
 *
 * Responsibilities:
 *  - Connect to the Wren native messaging host (wren-bridge)
 *  - Receive commands from Wren (open-preview, close-preview, resize)
 *  - Create/manage popup windows for Wren-controlled previews
 *  - Forward network events from content scripts back to Wren
 */

// ── State ────────────────────────────────────────────────────────────────────

/** Map from wrenWindowId (string) → Chrome windowId (number) */
const wrenWindows = new Map();

/** Map from Chrome tabId → wrenWindowId */
const tabToWrenId = new Map();

/** Native messaging port to wren-bridge */
let nativePort = null;
let reconnectTimer = null;
const RECONNECT_DELAY_MS = 3000;

// ── Native Messaging ─────────────────────────────────────────────────────────

function connectNativeHost() {
  if (nativePort) return;

  try {
    nativePort = chrome.runtime.connectNative("com.wren.bridge");

    nativePort.onMessage.addListener((message) => {
      handleWrenCommand(message);
    });

    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      console.log("[NexusBridge] Native host disconnected:", err?.message ?? "unknown");
      nativePort = null;
      scheduleReconnect();
    });

    console.log("[NexusBridge] Connected to native host");
  } catch (e) {
    console.log("[NexusBridge] Failed to connect to native host:", e);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNativeHost();
  }, RECONNECT_DELAY_MS);
}

function sendToWren(message) {
  if (!nativePort) {
    console.warn("[NexusBridge] Native port not connected; dropping message:", message.type);
    return;
  }
  nativePort.postMessage(message);
}

// ── Command Handlers ─────────────────────────────────────────────────────────

async function handleWrenCommand(msg) {
  const { type, wrenWindowId, url, width, height, left, top } = msg;

  switch (type) {
    case "open-preview":
      await openPreview(wrenWindowId, url, { width, height, left, top });
      break;

    case "close-preview":
      await closePreview(wrenWindowId);
      break;

    case "resize-preview":
      await resizePreview(wrenWindowId, { width, height, left, top });
      break;

    case "navigate-preview":
      await navigatePreview(wrenWindowId, url);
      break;

    case "ping":
      sendToWren({ type: "pong", wrenWindowId: null });
      break;

    default:
      console.warn("[NexusBridge] Unknown command:", type);
  }
}

async function openPreview(wrenWindowId, url, opts = {}) {
  if (wrenWindows.has(wrenWindowId)) {
    // Already open — navigate instead
    await navigatePreview(wrenWindowId, url);
    return;
  }

  try {
    const win = await chrome.windows.create({
      url,
      type: "popup",
      width: opts.width ?? 1280,
      height: opts.height ?? 800,
      left: opts.left,
      top: opts.top,
      focused: false,
    });

    wrenWindows.set(wrenWindowId, win.id);

    // Track tab → wrenWindowId for content script events
    if (win.tabs && win.tabs.length > 0) {
      tabToWrenId.set(win.tabs[0].id, wrenWindowId);
    }

    // Inject content script immediately
    if (win.tabs && win.tabs.length > 0) {
      await injectContentScript(win.tabs[0].id);
    }

    sendToWren({ type: "preview-opened", wrenWindowId, chromeWindowId: win.id });
  } catch (e) {
    sendToWren({ type: "preview-error", wrenWindowId, error: e.message });
  }
}

async function closePreview(wrenWindowId) {
  const chromeWindowId = wrenWindows.get(wrenWindowId);
  if (!chromeWindowId) return;

  wrenWindows.delete(wrenWindowId);

  try {
    const win = await chrome.windows.get(chromeWindowId, { populate: true });
    for (const tab of win.tabs ?? []) {
      tabToWrenId.delete(tab.id);
    }
    await chrome.windows.remove(chromeWindowId);
  } catch { /* window may already be closed */ }

  sendToWren({ type: "preview-closed", wrenWindowId });
}

async function resizePreview(wrenWindowId, opts) {
  const chromeWindowId = wrenWindows.get(wrenWindowId);
  if (!chromeWindowId) return;

  const update = {};
  if (opts.width != null) update.width = opts.width;
  if (opts.height != null) update.height = opts.height;
  if (opts.left != null) update.left = opts.left;
  if (opts.top != null) update.top = opts.top;

  try {
    await chrome.windows.update(chromeWindowId, update);
  } catch (e) {
    console.warn("[NexusBridge] resize failed:", e.message);
  }
}

async function navigatePreview(wrenWindowId, url) {
  const chromeWindowId = wrenWindows.get(wrenWindowId);
  if (!chromeWindowId) return;

  try {
    const win = await chrome.windows.get(chromeWindowId, { populate: true });
    if (win.tabs && win.tabs.length > 0) {
      await chrome.tabs.update(win.tabs[0].id, { url });
    }
  } catch (e) {
    console.warn("[NexusBridge] navigate failed:", e.message);
  }
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (e) {
    console.warn("[NexusBridge] content script inject failed:", e.message);
  }
}

// ── Content Script Message Handler ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== "network-event") return;

  const wrenWindowId = tabToWrenId.get(sender.tab?.id);
  if (!wrenWindowId) return; // not a Wren-controlled tab

  sendToWren({
    type: "network-event",
    wrenWindowId,
    event: message.event,
  });
});

// ── Window Close Cleanup ─────────────────────────────────────────────────────

chrome.windows.onRemoved.addListener((closedWindowId) => {
  for (const [wrenId, chromeId] of wrenWindows.entries()) {
    if (chromeId === closedWindowId) {
      wrenWindows.delete(wrenId);
      sendToWren({ type: "preview-closed", wrenWindowId: wrenId, reason: "user-closed" });
      break;
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabToWrenId.delete(tabId);
});

// ── Tab navigation: re-inject content script after navigation ────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  if (!tabToWrenId.has(tabId)) return;

  await injectContentScript(tabId);
});

// ── Startup ──────────────────────────────────────────────────────────────────

connectNativeHost();
