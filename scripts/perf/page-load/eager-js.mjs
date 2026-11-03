/**
 * Critical-path JavaScript per route.
 *
 * The build's `route-bundle-stats.json` counts every chunk a route can reach,
 * including ones loaded on demand, so it overstates what a player waits for.
 * This measures the bytes that actually arrive before the `load` event, from
 * `PerformanceResourceTiming` in a real browser, which is the number that
 * affects LCP and time-to-interactive.
 *
 * Usage:
 *   node scripts/perf/page-load/eager-js.mjs \
 *     --base=http://127.0.0.1:3100 \
 *     --storage=/tmp/ahd-player.json \
 *     --routes=/profile,/market,/corporation/1 \
 *     [--runs=3] [--mobile]
 */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const base = arg("base", "http://127.0.0.1:3100").replace(/\/$/, "");
const storage = arg("storage", "");
const routes = arg("routes", "/").split(",").filter(Boolean);
const runs = Number(arg("runs", "3"));
const mobile = process.argv.includes("--mobile");
const timeoutMs = Number(arg("timeout", "120000"));

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const storageState = storage ? JSON.parse(await readFile(storage, "utf8")) : undefined;
let failures = 0;

for (const route of routes) {
  const samples = [];
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
      isMobile: mobile,
      ...(storageState ? { storageState } : {}),
    });
    const page = await context.newPage();
    try {
      await page.goto(base + route, { waitUntil: "load", timeout: timeoutMs });
      await page.waitForTimeout(2_000);
      samples.push(
        await page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0];
          const loadEnd = nav?.loadEventEnd ?? 0;
          let eager = 0;
          let total = 0;
          let eagerChunks = 0;
          for (const entry of performance.getEntriesByType("resource")) {
            if (!/\.js(\?|$)/.test(entry.name)) continue;
            const bytes = entry.encodedBodySize || 0;
            total += bytes;
            if (entry.responseEnd > 0 && entry.responseEnd <= loadEnd) {
              eager += bytes;
              eagerChunks++;
            }
          }
          return { eager, total, eagerChunks, loadEnd: Math.round(loadEnd) };
        })
      );
    } catch (error) {
      failures++;
      console.log(`${route} failed: ${String(error).slice(0, 120)}`);
    }
    await context.close();
  }
  if (!samples.length) continue;
  console.log(
    `${route.padEnd(44)} eager=${(median(samples.map((s) => s.eager)) / 1024).toFixed(0)}KB ` +
      `(${median(samples.map((s) => s.eagerChunks))} chunks) ` +
      `total=${(median(samples.map((s) => s.total)) / 1024).toFixed(0)}KB ` +
      `load=${median(samples.map((s) => s.loadEnd))}ms`
  );
}

await browser.close();
process.exit(failures ? 1 : 0);
