import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) throw new Error("Pass unpacked Vitest shard logs from recent full CI runs");

const results = new Map();
const row = /✓ ((?:src|tests|scripts)\/[^\s]+\.(?:test|spec)\.[jt]sx?) \([^\r\n)]*\) (\d+)ms\b/g;
for (const file of files) {
  const log = readFileSync(file, "utf8").replace(/\x1b\[[0-9;]*m/g, "");
  for (const [, path, duration] of log.matchAll(row)) {
    const times = results.get(path) ?? [];
    times.push(Number(duration));
    results.set(path, times);
  }
}

const weights = {};
for (const path of [...results.keys()].sort()) {
  const times = results.get(path).sort((a, b) => a - b);
  if (times.length < 2) continue;
  const middle = Math.floor(times.length / 2);
  const median = times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2;
  if (median >= 500) weights[path] = Math.round(median / 50) * 50;
}
if (Object.keys(weights).length === 0) throw new Error("No repeated timing samples were found");
console.log(JSON.stringify(weights, null, 2));
