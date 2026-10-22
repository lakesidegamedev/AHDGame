/**
 * Repeatable page-load benchmark for the 20 slowest route families.
 *
 * Measures, per route: TTFB, FCP, DOMContentLoaded, load (the same number the
 * production pageview telemetry records: Navigation Timing loadEventEnd), HTML
 * bytes, JS bytes and request count. Fresh browser context per sample (cold
 * cache, no reuse), interleaved rounds so slow drift affects all routes evenly,
 * median across samples.
 *
 * Usage:
 *   node scripts/perf/page-load/run.mjs --base=http://127.0.0.1:3100 --label=baseline [--runs=5]
 *                      [--storage=<state.json>] [--routes=a,b,c]
 * Writes scripts/perf/page-load/results/<label>.json and prints a table.
 */
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const base = arg("base", "http://127.0.0.1:3100").replace(/\/$/, "");
const label = arg("label", "run");
const runs = Number(arg("runs", "5"));
const storage = arg("storage", "");
const mobile = process.argv.includes("--mobile");

const ALL_ROUTES = [
  "/login",
  "/register",
  "/auth/google/result",
  "/auth/discord/result",
  "/country/us/region/MO/legislature",
  "/country/us/region/MO/office",
  "/country/us/region/MO",
  "/country/us/region/MO/party/2",
  "/country/jp/region/CGK/party/23",
  "/country/us/executive/cabinet",
  "/country/jp/executive/cabinet/defense_minister/office",
  "/charters/new",
  "/charters/6ac479c5bcf297831c0d1038",
  "/world",
  "/world/legacy",
  "/country/us/stockmarket",
  "/centralbank/us",
  "/maintenance",
  "/forex/global",
  "/corporation/993/group",
  "/corporation/6ac763824f4573325e5f8069/group",
  "/notifications",
  "/settings",
];

const only = arg("routes", "");
const routes = only ? only.split(",") : ALL_ROUTES;

function median(values) {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const browser = await chromium.launch({
  args: ["--disable-dev-shm-usage", "--no-sandbox"],
});
const contextOptions = {
  viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
  isMobile: mobile,
  bypassCSP: true,
  ...(storage ? { storageState: JSON.parse(await readFile(storage, "utf8")) } : {}),
};

const samples = new Map(routes.map((r) => [r, []]));

for (let round = 0; round < runs; round++) {
  for (const route of routes) {
    const context = await browser.newContext(contextOptions);
    await context.route("**/*", (r) => r.continue());
    const page = await context.newPage();
    let jsBytes = 0;
    let htmlBytes = 0;
    let requests = 0;
    page.on("response", (res) => {
      requests++;
      try {
        const type = res.request().resourceType();
        const len = Number(res.headers()["content-length"] || 0);
        if (type === "script") jsBytes += len;
        if (type === "document") htmlBytes += len;
      } catch {
        /* headers unavailable */
      }
    });
    try {
      await page.goto(base + route, { waitUntil: "load", timeout: 60_000 });
      const nav = await page.evaluate(() => {
        const e = performance.getEntriesByType("navigation")[0];
        const paint = performance.getEntriesByType("paint");
        const fcp = paint.find((p) => p.name === "first-contentful-paint");
        return e
          ? {
              ttfb: e.responseStart,
              fcp: fcp ? fcp.startTime : NaN,
              dcl: e.domContentLoadedEventEnd,
              load: e.loadEventEnd,
              encoded: e.encodedBodySize,
              url: location.pathname,
            }
          : null;
      });
      if (!nav || !nav.load) throw new Error("no navigation timing");
      samples.get(route).push({ ...nav, jsBytes, htmlBytes, requests });
    } catch (err) {
      samples.get(route).push({ error: String(err).slice(0, 160) });
    }
    await context.close();
  }
}

await browser.close();

const results = routes.map((route) => {
  const ok = samples.get(route).filter((s) => !s.error);
  return {
    route,
    samples: ok.length,
    errors: samples
      .get(route)
      .filter((s) => s.error)
      .map((s) => s.error),
    ttfb: Math.round(median(ok.map((s) => s.ttfb))),
    fcp: Math.round(median(ok.map((s) => s.fcp))),
    dcl: Math.round(median(ok.map((s) => s.dcl))),
    load: Math.round(median(ok.map((s) => s.load))),
    htmlKB: Math.round(median(ok.map((s) => s.encoded)) / 1024),
    jsKB: Math.round(median(ok.map((s) => s.jsBytes)) / 1024),
    requests: Math.round(median(ok.map((s) => s.requests))),
    finalPath: ok[0]?.url ?? "",
  };
});

await mkdir(new URL("./results/", import.meta.url), { recursive: true });
const out = new URL(`./results/${label}.json`, import.meta.url);
await writeFile(
  out,
  JSON.stringify(
    { label, base, mobile, runs, measuredAt: new Date().toISOString(), results },
    null,
    2
  )
);

console.log(`label=${label} base=${base} runs=${runs} mobile=${mobile}`);
for (const r of results) {
  const err = r.errors.length ? ` ERR(${r.errors.length}: ${r.errors[0]})` : "";
  console.log(
    `${r.route.padEnd(52)} ttfb=${String(r.ttfb).padStart(5)} fcp=${String(r.fcp).padStart(5)} dcl=${String(r.dcl).padStart(5)} load=${String(r.load).padStart(5)} html=${String(r.htmlKB).padStart(4)}KB js=${String(r.jsKB).padStart(4)}KB req=${String(r.requests).padStart(3)}${err}`
  );
}
console.log(`wrote ${out.pathname}`);
