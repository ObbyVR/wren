#!/usr/bin/env node
/**
 * Wren Nexus Bridge — Native Messaging Host
 *
 * Protocol: Chrome Native Messaging
 *   Each message = 4-byte little-endian length prefix + JSON payload.
 *
 * This host bridges between the Chrome extension and the Wren Electron process.
 * It connects to Wren's local WebSocket server (default: ws://127.0.0.1:7345)
 * and relays messages in both directions.
 */

"use strict";

const { WebSocket } = require("ws");

const WREN_WS_URL = process.env.WREN_BRIDGE_URL ?? "ws://127.0.0.1:7345";
const RECONNECT_DELAY_MS = 3000;

// ── Chrome Native Messaging I/O ──────────────────────────────────────────────

function readMessage(callback) {
  const lengthBuf = Buffer.alloc(4);
  let bytesRead = 0;

  function readChunk() {
    const chunk = process.stdin.read(4 - bytesRead);
    if (!chunk) {
      process.stdin.once("readable", readChunk);
      return;
    }
    chunk.copy(lengthBuf, bytesRead);
    bytesRead += chunk.length;

    if (bytesRead < 4) {
      process.stdin.once("readable", readChunk);
      return;
    }

    const length = lengthBuf.readUInt32LE(0);
    readPayload(length, callback);
  }

  process.stdin.once("readable", readChunk);
}

function readPayload(length, callback) {
  let data = Buffer.alloc(0);

  function readChunk() {
    const remaining = length - data.length;
    const chunk = process.stdin.read(remaining);
    if (!chunk) {
      process.stdin.once("readable", readChunk);
      return;
    }
    data = Buffer.concat([data, chunk]);
    if (data.length < length) {
      process.stdin.once("readable", readChunk);
      return;
    }
    try {
      callback(JSON.parse(data.toString("utf8")));
    } catch (e) {
      logError("Failed to parse message:", e.message);
    }
    // Read next message
    readMessage(callback);
  }

  process.stdin.once("readable", readChunk);
}

function sendMessage(message) {
  const json = JSON.stringify(message);
  const buf = Buffer.from(json, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length, 0);
  process.stdout.write(len);
  process.stdout.write(buf);
}

function logError(...args) {
  process.stderr.write(args.join(" ") + "\n");
}

// ── WebSocket Connection to Wren ─────────────────────────────────────────────

let ws = null;
let reconnectTimer = null;
/** Messages queued while disconnected */
const pendingQueue = [];

function connectToWren() {
  if (ws) return;

  ws = new WebSocket(WREN_WS_URL);

  ws.on("open", () => {
    logError("[NexusBridge host] Connected to Wren at", WREN_WS_URL);
    // Flush pending messages
    while (pendingQueue.length > 0) {
      const msg = pendingQueue.shift();
      ws.send(JSON.stringify(msg));
    }
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString("utf8"));
      // Forward command from Wren to the extension
      sendMessage(msg);
    } catch (e) {
      logError("[NexusBridge host] Parse error from Wren:", e.message);
    }
  });

  ws.on("close", () => {
    logError("[NexusBridge host] Wren WebSocket closed, will reconnect");
    ws = null;
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    logError("[NexusBridge host] WebSocket error:", err.message);
    ws = null;
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToWren();
  }, RECONNECT_DELAY_MS);
}

function forwardToWren(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    pendingQueue.push(message);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Handle stdin close (extension disconnected)
process.stdin.on("end", () => {
  logError("[NexusBridge host] stdin closed, exiting");
  process.exit(0);
});

process.stdin.resume();

// Start reading messages from the extension
readMessage((msg) => {
  forwardToWren(msg);
});

connectToWren();
