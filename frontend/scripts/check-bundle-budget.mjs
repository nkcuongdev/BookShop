import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
const html = await readFile(path.join(DIST_DIR, "index.html"), "utf8");
const initialAssetMatches = [
  ...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+\.js)"/g),
];
const initialAssets = [...new Set(initialAssetMatches.map((match) => match[1]))];
const forbiddenPreloads = initialAssets.filter((asset) => /chart|recharts/i.test(asset));

if (forbiddenPreloads.length) {
  throw new Error(`Admin chart code is preloaded by the public entry: ${forbiddenPreloads.join(", ")}`);
}

let initialGzipBytes = 0;
for (const asset of initialAssets) {
  const filePath = path.join(DIST_DIR, asset.replace(/^\//, ""));
  await stat(filePath);
  initialGzipBytes += gzipSync(await readFile(filePath)).byteLength;
}

const budgetBytes = 250 * 1024;
if (initialGzipBytes > budgetBytes) {
  throw new Error(
    `Initial JavaScript is ${(initialGzipBytes / 1024).toFixed(1)} KiB gzip; budget is ${budgetBytes / 1024} KiB`
  );
}

console.log(
  `[bundle-budget] initial JS ${(initialGzipBytes / 1024).toFixed(1)} KiB gzip across ${initialAssets.length} asset(s)`
);
