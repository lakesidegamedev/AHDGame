/**
 * Page-load phase breakdown for a set of routes.
 *
 * Reports, per route: TTFB, first contentful paint, DOMContentLoaded, load,
 * HTML bytes, JS bytes and request count. Used to attribute the client-reported
 * loadTimeMs telemetry (Navigation Timing loadEventEnd) to server vs client.
 *
 * Usage: node scripts/perf/page-load/route-phases.mjs <baseUrl> [runs] [--mobile]
 */
import { chromium } from "playwright";

const base = (process.argv[2] || "http://127.0.0.1:3100").replace(/\/$/, "");
const runs = Number(process.argv[3] || 2);
const mobile = process.argv.includes("--mobile");

const ROUTES = [
  "/login",
  "/register",
  "/country/us/region/MO/legislature",
  "/country/us/region/MO/office",
  "/country/us/region/MO",
  "/forex/global",
  "/corporation/993/group",
  "/corporation/6ac763824f4573325e5f8069/group",
  "/country/us/executive/cabinet",
  "/country/jp/executive/cabinet/defense_minister/office",
  "/charters/new",
  "/world",
  "/world/legacy",
  "/country/us/stockmarket",
  "/centralbank/us",
  "/maintenance",
];

function pct(values, p) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

const browser = await chromium.launch();
const results = [];

for (const route of ROUTES) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
      isMobile: mobile,
      userAgent: mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined,
      bypassCSP: true,
    });
    const page = await context.newPage();
    let jsBytes = 0;
    let requests = 0;
    let htmlBytes = 0;
    page.on("response", async (res) => {
      requests++;
      try {
        const len = Number(res.headers()["content-length"] || 0);
        const type = res.request().resourceType();
        if (type === "script") jsBytes += len;
        if (type === "document") htmlBytes += len;
      } catch {
        /* ignore */
      }
    });
    let loadMs = NaN;
    try {
      await page.goto(base + route, { waitUntil: "load", timeout: 60_000 });
      loadMs = await page.evaluate(() => performance.now());
      const nav = await page.evaluate(() => {
        const e = performance.getEntriesByType("navigation")[0];
        const paint = performance.getEntriesByType("paint");
        const fcp = paint.find((p) => p.name === "first-contentful-paint");
        return e
          ? {
              ttfb: e.responseStart,
              dcl: e.domContentLoadedEventEnd,
              load: e.loadEventEnd,
              fcp: fcp ? fcp.startTime : NaN,
              transfer: e.transferSize,
              encoded: e.encodedBodySize,
            }
          : null;
      });
      samples.push({ ...nav, loads: loadMs, jsBytes, requests, htmlBytes, status: 200 });
    } catch (err) {
      samples.push({ error: String(err).slice(0, 120) });
    }
    await context.close();
  }
  const ok = samples.filter((s) => !s.error && s.load);
  const agg = {
    route,
    runs: ok.length,
    ttfb: Math.round(
      pct(
        ok.map((s) => s.ttfb),
        50
      )
    ),
    fcp: Math.round(
      pct(
        ok.map((s) => s.fcp),
        50
      )
    ),
    dcl: Math.round(
      pct(
        ok.map((s) => s.dcl),
        50
      )
    ),
    load: Math.round(
      pct(
        ok.map((s) => s.load),
        50
      )
    ),
    htmlKB: Math.round(
      pct(
        ok.map((s) => s.encoded),
        50
      ) / 1024
    ),
    jsKB: Math.round(
      pct(
        ok.map((s) => s.jsBytes),
        50
      ) / 1024
    ),
    requests: Math.round(
      pct(
        ok.map((s) => s.requests),
        50
      )
    ),
  };
  results.push(agg);
  console.log(
    `${agg.route.padEnd(56)} ttfb=${String(agg.ttfb).padStart(5)} fcp=${String(agg.fcp).padStart(5)} dcl=${String(agg.dcl).padStart(5)} load=${String(agg.load).padStart(5)} html=${String(agg.htmlKB).padStart(5)}KB js=${String(agg.jsKB).padStart(5)}KB req=${agg.requests}`
  );
}
await browser.close();
