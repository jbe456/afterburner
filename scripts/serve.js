/**
 * Zero-dependency static server for local development.
 *
 * ES modules cannot be loaded over file://, so the game needs to be served.
 * This uses only node:http and node:fs, which Bun implements too, so the same
 * file runs under `node` and `bun` without a build step or a package install.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = Number(process.env.PORT) || 8765;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  // Resolve inside ROOT only — refuse anything that escapes via "..".
  const filePath = join(ROOT, normalize(pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
      // Always re-read during development.
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
});

server.listen(PORT, () => {
  const runtime = typeof Bun !== "undefined" ? "bun" : "node";
  console.log(`Afterburner (${runtime}) → http://localhost:${PORT}`);
});
