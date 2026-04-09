/**
 * Minimal local file server for Preview.
 * Serves files from the local filesystem at http://localhost:PORT/serve?path=/abs/path
 * Copied from Paperclip's local-files.ts pattern.
 */
import http from "http";
import fs from "fs";
import path from "path";

const MIME_MAP: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

const BLOCKED_PREFIXES = ["/etc", "/var", "/System", "/Library", "/usr", "/sbin", "/bin"];

let serverPort = 0;

export function getLocalFileServerPort(): number {
  return serverPort;
}

export function startLocalFileServer(): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "", `http://localhost`);
      const filePath = url.searchParams.get("path");

      if (!filePath) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Missing ?path= parameter");
        return;
      }

      const resolved = path.resolve(filePath);

      // Block system directories
      if (BLOCKED_PREFIXES.some((p) => resolved === p || resolved.startsWith(p + "/"))) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden path");
        return;
      }

      fs.stat(resolved, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("File not found");
          return;
        }

        const ext = path.extname(resolved).toLowerCase();
        const mime = MIME_MAP[ext] || "application/octet-stream";

        res.writeHead(200, {
          "Content-Type": mime,
          "Content-Length": stats.size,
          "Cache-Control": "no-cache",
          // Allow iframe embedding from Wren
          "X-Frame-Options": "SAMEORIGIN",
        });

        fs.createReadStream(resolved).pipe(res);
      });
    });

    // Listen on random available port
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      serverPort = typeof addr === "object" && addr ? addr.port : 0;
      console.log(`[file-server] listening on http://127.0.0.1:${serverPort}`);
      resolve(serverPort);
    });
  });
}
