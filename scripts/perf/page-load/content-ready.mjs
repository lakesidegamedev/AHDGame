/**
 * Time-to-content for a client-rendered page.
 *
 * The pageview telemetry records `loadEventEnd`, which happens before a client
 * component's first API fetch resolves. On pages like `/corporation/[id]` that
 * fetch *is* the content, so this measures the user-perceived number: navigation
 * start until the content selector appears, plus the bytes and duration of the
 * data request behind it.
 *
 * Usage:
 *   node scripts/perf/page-load/content-ready.mjs \
 *     --base=http://127.0.0.1:3100 \
 *     --route=/corporation/1 \
 *     --ready="text=Cinder Lake" \
 *     --api=/api/corporations/1 \
 *     [--runs=3] [--mobile]
 *
 * Each sample uses a fresh browser context (cold cache) and interleaves nothing:
 * the median across runs is printed, errors are counted rather than hidden.
 */
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const base = arg("base", "http://127.0.0.1:3100").replace(/\/$/, "");
const route = arg("route", "/corporation/1");
const readySelector = arg("ready", "h1");
const apiPath = arg("api", "");
const runs = Number(arg("runs", "3"));
const mobile = process.argv.includes("--mobile");
const timeoutMs = Number(arg("timeout", "90000"));

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--no-sandbox"] });
const samples = [];

for (let run = 0; run < runs; run++) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
    isMobile: mobile,
    bypassCSP: true,
  });
  const page = await context.newPage();

  if (mobile) {
    const cdp = await context.newCDPSession(page);
    // Mid-tier phone profile used by the earlier perf audits: 4x CPU
    // throttling and ~1.6 Mbps down / 750 Kbps up.
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }

  let apiBytes = 0;
  let apiMs = NaN;
  const apiStarted = new Map();
  const matchesApi = (url) => {
    if (!apiPath) return false;
    try {
      return new URL(url).pathname === apiPath;
    } catch {
      return false;
    }
  };
  page.on("request", (req) => {
    if (!matchesApi(req.url())) return;
    apiStarted.set(req.url(), Date.now());
  });
  page.on("response", async (res) => {
    if (!matchesApi(res.url())) return;
    const started = apiStarted.get(res.url());
    if (started) apiMs = Date.now() - started;
    const headers = res.headers();
    const length = Number(headers["content-length"] || 0);
    apiBytes = length || (await res.body().catch(() => Buffer.alloc(0))).byteLength;
  });

  const startedAt = Date.now();
  try {
    await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForSelector(readySelector, { timeout: timeoutMs });
    const contentReady = Date.now() - startedAt;

    const nav = await page.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0];
      const paint = performance.getEntriesByType("paint");
      const fcp = paint.find((p) => p.name === "first-contentful-paint");
      return entry
        ? {
            ttfb: Math.round(entry.responseStart),
            fcp: fcp ? Math.round(fcp.startTime) : NaN,
            load: Math.round(entry.loadEventEnd),
            docBytes: entry.encodedBodySize,
          }
        : null;
    });

    samples.push({ ok: true, ...nav, contentReady, apiBytes, apiMs: Math.round(apiMs) });
  } catch (error) {
    samples.push({ ok: false, error: String(error).slice(0, 160) });
  }

  await context.close();
}

await browser.close();

const ok = samples.filter((s) => s.ok);
const failures = samples.filter((s) => !s.ok);
console.log(
  `route=${route} mode=${mobile ? "mobile(4x cpu, 1.6Mbps)" : "desktop"} runs=${runs} ok=${ok.length} failed=${failures.length}`
);
if (ok.length) {
  console.log(
    `  ttfb=${median(ok.map((s) => s.ttfb))}ms fcp=${median(ok.map((s) => s.fcp))}ms load=${median(
      ok.map((s) => s.load)
    )}ms contentReady=${median(ok.map((s) => s.contentReady))}ms doc=${median(
      ok.map((s) => s.docBytes)
    )}B api=${median(ok.map((s) => s.apiBytes))}B apiMs=${median(ok.map((s) => s.apiMs))}ms`
  );
}
for (const failure of failures) console.log(`  failed: ${failure.error}`);
