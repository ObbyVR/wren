/**
 * Wren Nexus Bridge — Content Script
 *
 * Injected only into tabs opened by Wren (popup windows).
 * Responsibilities:
 *  - Intercept fetch / XMLHttpRequest for the Network panel
 *  - Send network events to background via chrome.runtime.sendMessage
 *
 * Note: Address bar is already absent in popup-type windows, so no CSS
 * injection is needed to hide browser chrome.
 */

(function () {
  "use strict";

  if (window.__wrenBridgeInjected) return;
  window.__wrenBridgeInjected = true;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function sendNetworkEvent(event) {
    chrome.runtime.sendMessage({ type: "network-event", event });
  }

  function now() {
    return Date.now();
  }

  // ── Fetch Interception ───────────────────────────────────────────────────────

  const _fetch = window.fetch;

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const startTime = now();
    const requestId = `fetch-${startTime}-${Math.random().toString(36).slice(2)}`;

    sendNetworkEvent({
      requestId,
      type: "request",
      method,
      url,
      timestamp: startTime,
    });

    try {
      const response = await _fetch(input, init);
      const duration = now() - startTime;

      sendNetworkEvent({
        requestId,
        type: "response",
        method,
        url,
        status: response.status,
        statusText: response.statusText,
        duration,
        timestamp: now(),
      });

      return response;
    } catch (err) {
      sendNetworkEvent({
        requestId,
        type: "error",
        method,
        url,
        error: err.message,
        duration: now() - startTime,
        timestamp: now(),
      });
      throw err;
    }
  };

  // ── XMLHttpRequest Interception ──────────────────────────────────────────────

  const _XHROpen = XMLHttpRequest.prototype.open;
  const _XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__wrenMethod = method.toUpperCase();
    this.__wrenUrl = String(url);
    return _XHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const method = this.__wrenMethod ?? "GET";
    const url = this.__wrenUrl ?? "";
    const startTime = now();
    const requestId = `xhr-${startTime}-${Math.random().toString(36).slice(2)}`;

    sendNetworkEvent({
      requestId,
      type: "request",
      method,
      url,
      timestamp: startTime,
    });

    this.addEventListener("load", () => {
      sendNetworkEvent({
        requestId,
        type: "response",
        method,
        url,
        status: this.status,
        statusText: this.statusText,
        duration: now() - startTime,
        timestamp: now(),
      });
    });

    this.addEventListener("error", () => {
      sendNetworkEvent({
        requestId,
        type: "error",
        method,
        url,
        error: "Network error",
        duration: now() - startTime,
        timestamp: now(),
      });
    });

    return _XHRSend.apply(this, arguments);
  };
})();
