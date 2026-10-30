/**
 * Bundles the game back into one self-contained dist/index.html that can be
 * opened straight from disk or dropped on any static host — no module loading,
 * no server, no network requests.
 *
 * Requires Bun, which has a bundler built in. Development (`npm run dev`)
 * works on plain Node.
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

if (typeof Bun === "undefined") {
  console.error("build requires Bun (it uses Bun's bundler).\n  bun run build");
  process.exit(1);
}

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(ROOT, "src/main.js")],
  minify: true,
  target: "browser",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const js = await result.outputs[0].text();
const css = await readFile(join(ROOT, "src/styles.css"), "utf8");
const html = await readFile(join(ROOT, "index.html"), "utf8");

const inlined = html
  .replace('<link rel="stylesheet" href="./src/styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', `<script type="module">\n${js}\n</script>`);

const out = join(DIST, "index.html");
await writeFile(out, inlined);

const kb = (Buffer.byteLength(inlined) / 1024).toFixed(1);
console.log(`built dist/index.html (${kb} kB) — open it directly, no server needed`);
