#!/usr/bin/env node
/**
 * Lighthouse scorecard for the top-35 public pages in `pages.mjs`: per-page
 * JSON/HTML reports, a Markdown summary, and an optional floor-budget gate.
 *
 * node scripts/perf/lighthouse/run.mjs --base=<url> --strategy=mobile|desktop
 *   [--pages=/,/faq] [--runs=3 (median)] [--out=<dir>] [--budget=strict|off]
 *   [--chrome-path=<chrome>]
 *   [--cohort=public|signed-in|all] [--storage=<login-state.mjs output>]
 *   [--corp=<id>] [--party=<id>]
 *
 * The signed-in cohort needs --storage (the cookie jar written by
 * scripts/perf/page-load/login-state.mjs against the benchmark world).
 *
 * Needs the `lighthouse` and `chrome-launcher` devDependencies and a Chrome
 * (CHROME_PATH, --chrome-path, or a system install).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { readFile } from "node:fs/promises";
import { SIGNED_IN_PAGES, TOP_PAGES } from "./pages.mjs";
import {
  METRIC_BUDGETS,
  METRIC_IDS,
  PAGE_BUDGET_OVERRIDES,
  SCORE_BUDGETS,
  SIGNED_IN_BUDGETS,
} from "./budgets.mjs";

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

function arg(name, fallback) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const base = arg("base", "http://127.0.0.1:3000").replace(/\/$/, "");
const strategy = arg("strategy", "mobile");
const runs = Math.max(1, Number(arg("runs", "1")));
const outDir = path.resolve(arg("out", "scripts/perf/lighthouse/results"));
const budgetMode = arg("budget", "strict");
const only = arg("pages", "");
const chromePath = arg("chrome-path", process.env.CHROME_PATH || undefined);

if (!["mobile", "desktop"].includes(strategy)) {
  console.error(`Unknown --strategy=${strategy}; expected mobile or desktop.`);
  process.exit(2);
}

const cohort = arg("cohort", "public");
if (!["public", "signed-in", "all"].includes(cohort)) {
  console.error(`Unknown --cohort=${cohort}; expected public, signed-in or all.`);
  process.exit(2);
}
const storagePath = arg("storage", "");
const idParams = { corp: arg("corp", ""), party: arg("party", "") };

let cookieHeader = "";
if (cohort !== "public") {
  if (!storagePath) {
    console.error("--cohort=signed-in|all needs --storage=<login-state.mjs output>.");
    process.exit(2);
  }
  const state = JSON.parse(await readFile(storagePath, "utf8"));
  cookieHeader = (state.cookies ?? []).map((c) => `${c.name}=${c.value}`).join("; ");
  if (!cookieHeader) {
    console.error(`No cookies in ${storagePath}.`);
    process.exit(2);
  }
}

const cohortPages =
  cohort === "public"
    ? TOP_PAGES
    : cohort === "signed-in"
      ? SIGNED_IN_PAGES
      : [...TOP_PAGES, ...SIGNED_IN_PAGES];

/** Fills `:corp` / `:party`; a page whose id is unknown is skipped, not guessed. */
function resolvePage(page) {
  let missing = false;
  const resolved = page.path.replace(/:(\w+)/g, (_, key) => {
    if (!idParams[key]) missing = true;
    return idParams[key] ?? "";
  });
  return missing ? null : { ...page, path: resolved, budgetKey: page.path };
}

const pages = only
  ? only
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(
        (value) =>
          cohortPages.find((page) => page.path === value) ?? {
            path: value,
            name: slug(value),
            group: "custom",
            signedIn: cohort !== "public",
          }
      )
  : cohortPages.map(resolvePage).filter(Boolean);

function slug(value) {
  if (value === "/") return "home";
  return (
    value
      .replace(/^\//, "")
      .replace(/[/?=&]+/g, "-")
      .replace(/-+$/, "") || "home"
  );
}

const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const desktopThrottling = {
  rttMs: 40,
  throughputKbps: 10 * 1024,
  cpuSlowdownMultiplier: 1,
  requestLatencyMs: 0,
  downloadThroughputKbps: 0,
  uploadThroughputKbps: 0,
};

const mobileScreen = {
  mobile: true,
  width: 412,
  height: 823,
  deviceScaleFactor: 1.75,
  disabled: false,
};

function auditValue(lhr, id) {
  const value = lhr.audits[id]?.numericValue;
  return Number.isFinite(value) ? value : null;
}

function failedAudits(lhr) {
  const failures = [];
  for (const category of Object.values(lhr.categories)) {
    for (const ref of category.auditRefs) {
      const audit = lhr.audits[ref.id];
      if (!audit || ref.weight === 0) continue;
      if (audit.score !== null && audit.score < 1) {
        failures.push({
          category: category.id,
          id: ref.id,
          score: audit.score,
          display: audit.displayValue ?? null,
        });
      }
    }
  }
  return failures;
}

function pct(value) {
  return value === null || value === undefined ? "n/a" : `${Math.round(value * 100)}`;
}

function ms(value) {
  return value === null || value === undefined ? "n/a" : `${Math.round(value)} ms`;
}

function evaluateBudget(page, scores, metrics, seoExcluded) {
  const limits = SCORE_BUDGETS[strategy];
  const override = page.signedIn
    ? (SIGNED_IN_BUDGETS[page.budgetKey ?? page.path] ?? {})
    : (PAGE_BUDGET_OVERRIDES[page.budgetKey ?? page.path] ?? {});
  const breaches = [];
  const metricWarnings = [];

  for (const id of METRIC_IDS) {
    const ceiling = METRIC_BUDGETS[strategy][id];
    const value = metrics[id];
    if (ceiling === undefined || value === null) continue;
    if (value > ceiling) {
      metricWarnings.push(`${id} ${Math.round(value)} > ${ceiling}`);
    }
  }

  for (const [category, floor] of Object.entries(limits.floor)) {
    // Pages that are deliberately noindex cannot pass Lighthouse's SEO audit,
    // so SEO is reported but never budgeted for them.
    if (category === "seo" && seoExcluded) continue;
    const effectiveFloor = override.floor?.[category] ?? floor;
    const score = scores[category];
    if (score !== null && score !== undefined && score < effectiveFloor) {
      breaches.push(`${category} ${pct(score)} < floor ${Math.round(effectiveFloor * 100)}`);
    }
  }

  return { breaches, metricWarnings };
}

await mkdir(outDir, { recursive: true });

const chrome = await chromeLauncher.launch({
  chromePath,
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

/**
 * Installs the saved session cookies in the browser itself over the DevTools
 * protocol. A Cookie request header alone is lost to Lighthouse's storage
 * reset and its own navigations, which silently turns every signed-in page
 * into the login page.
 */
async function installCookies(port, storagePath) {
  const state = JSON.parse(await readFile(storagePath, "utf8"));
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("DevTools connection failed"));
  });
  const cookies = (state.cookies ?? []).map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path ?? "/",
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
    ...(c.expires > 0 ? { expires: c.expires } : {}),
  }));
  await new Promise((resolve, reject) => {
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      if (message.error) reject(new Error(message.error.message));
      else resolve();
    };
    socket.send(JSON.stringify({ id: 1, method: "Storage.setCookies", params: { cookies } }));
  });
  socket.close();
}

if (cohort !== "public") await installCookies(chrome.port, storagePath);

const rows = [];
let breachCount = 0;

try {
  for (const page of pages) {
    const url = `${base}${page.path}`;
    const scoreSamples = Object.fromEntries(CATEGORIES.map((category) => [category, []]));
    const metricSamples = Object.fromEntries(METRIC_IDS.map((id) => [id, []]));
    let lastLhr = null;
    let lastError = null;

    for (let run = 0; run < runs; run++) {
      const flags = {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: CATEGORIES,
        formFactor: strategy,
        screenEmulation:
          strategy === "mobile"
            ? mobileScreen
            : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
        throttlingMethod: "simulate",
        ...(strategy === "desktop" ? { throttling: desktopThrottling } : {}),
        maxWaitForLoad: 90_000,
        ...(page.signedIn ? { disableStorageReset: true } : {}),
      };

      try {
        const result = await lighthouse(url, flags);
        if (
          page.signedIn &&
          /^\/(login|register)/.test(new URL(result.lhr.finalDisplayedUrl).pathname)
        ) {
          throw new Error(`redirected to ${result.lhr.finalDisplayedUrl}: session cookie rejected`);
        }
        lastLhr = result.lhr;
        for (const category of CATEGORIES) {
          const score = lastLhr.categories[category]?.score;
          if (Number.isFinite(score)) scoreSamples[category].push(score);
        }
        for (const id of METRIC_IDS) {
          const value = auditValue(lastLhr, id);
          if (value !== null) metricSamples[id].push(value);
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (lastError.includes("session cookie rejected")) {
          console.error(
            `FAIL ${page.path}: ${lastError}; stopping, every signed-in page would fail.`
          );
          await chrome.kill();
          process.exit(3);
        }
      }
    }

    if (!lastLhr) {
      console.error(`FAIL ${page.path}: ${lastError ?? "no report"}`);
      rows.push({ page, error: lastError ?? "no report" });
      breachCount += 1;
      continue;
    }

    const scores = Object.fromEntries(
      CATEGORIES.map((category) => [category, median(scoreSamples[category]) ?? null])
    );
    const metrics = Object.fromEntries(
      METRIC_IDS.map((id) => [id, median(metricSamples[id]) ?? null])
    );
    // A page that declares itself noindex (or is disallowed by robots.txt)
    // cannot pass Lighthouse's SEO audit, by design. Detect it from the report
    // rather than from a static list, so a page that flips to noindex under
    // some condition (an empty feed, a signed-out redirect) is not reported as
    // a regression.
    const crawlable = lastLhr.audits["is-crawlable"];
    const seoExcluded = page.seo === false || crawlable?.score === 0;
    const seoExcludedReason =
      page.seo === false
        ? "declared in pages.mjs"
        : crawlable?.score === 0
          ? "page is noindex/disallowed"
          : null;

    const budgetPage = page.signedIn
      ? {
          ...page,
          budgetKey: new URL(lastLhr.finalDisplayedUrl).pathname.replace(/[0-9a-f]{24}/, ":corp"),
        }
      : page;
    const { breaches, metricWarnings } = evaluateBudget(budgetPage, scores, metrics, seoExcluded);
    breachCount += breaches.length;

    const name = page.name ?? slug(page.path);
    await writeFile(path.join(outDir, `${name}.json`), JSON.stringify(lastLhr, null, 2));

    rows.push({
      page,
      url,
      scores,
      metrics,
      seoExcluded,
      seoExcludedReason,
      breaches,
      metricWarnings,
      failures: failedAudits(lastLhr).slice(0, 12),
      error: lastError,
    });

    console.log(
      [
        page.path.padEnd(38),
        `perf ${pct(scores.performance)}`.padEnd(9),
        `a11y ${pct(scores.accessibility)}`.padEnd(10),
        `bp ${pct(scores["best-practices"])}`.padEnd(8),
        `seo ${pct(scores.seo)}`.padEnd(8),
        `LCP ${ms(metrics["largest-contentful-paint"])}`.padEnd(12),
        `TBT ${ms(metrics["total-blocking-time"])}`.padEnd(12),
        `CLS ${metrics["cumulative-layout-shift"]?.toFixed(3) ?? "n/a"}`,
        breaches.length ? `  ✗ ${breaches.join("; ")}` : "",
        metricWarnings.length ? `  ⚠ ${metricWarnings.join("; ")}` : "",
      ].join(" ")
    );
  }
} finally {
  await chrome.kill();
}

const ok = rows.filter((row) => !row.error);
const average = (key) =>
  median(
    ok
      .filter((row) => !(key === "seo" && row.seoExcluded))
      .map((row) => row.scores[key])
      .filter(Number.isFinite)
  );
const summary = {
  base,
  strategy,
  runs,
  generatedAt: new Date().toISOString(),
  pageCount: rows.length,
  averages: Object.fromEntries(CATEGORIES.map((category) => [category, average(category)])),
  budget: { mode: budgetMode, breaches: breachCount },
  pages: rows.map((row) => ({
    path: row.page.path,
    group: row.page.group,
    scores: row.scores ?? null,
    metrics: row.metrics ?? null,
    seoExcluded: row.seoExcluded ?? false,
    seoExcludedReason: row.seoExcludedReason ?? null,
    breaches: row.breaches ?? [],
    metricWarnings: row.metricWarnings ?? [],
    failures: row.failures ?? [],
    error: row.error ?? null,
  })),
};

await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

const lines = [
  `# Lighthouse scorecard — ${strategy}`,
  "",
  `- Base: \`${base}\``,
  `- Pages: ${rows.length} (${runs} run${runs === 1 ? "" : "s"}, median)`,
  `- Generated: ${summary.generatedAt}`,
  "",
  "| Page | Perf | A11y | Best practices | SEO | LCP | TBT | CLS |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((row) => {
    if (row.error) return `| \`${row.page.path}\` | — | — | — | — | — | — | — |`;
    return `| \`${row.page.path}\` | ${pct(row.scores.performance)} | ${pct(row.scores.accessibility)} | ${pct(row.scores["best-practices"])} | ${pct(row.scores.seo)} | ${ms(row.metrics["largest-contentful-paint"])} | ${ms(row.metrics["total-blocking-time"])} | ${row.metrics["cumulative-layout-shift"]?.toFixed(3) ?? "n/a"} |`;
  }),
  "",
  `Averages: perf ${pct(summary.averages.performance)}, a11y ${pct(summary.averages.accessibility)}, best-practices ${pct(summary.averages["best-practices"])}, seo ${pct(summary.averages.seo)}.`,
  "",
  "## Budget breaches",
  "",
  breachCount === 0
    ? "None."
    : rows
        .flatMap((row) => (row.breaches ?? []).map((breach) => `- \`${row.page.path}\`: ${breach}`))
        .join("\n"),
  "",
  "## Metric warnings (reported, not gated)",
  "",
  "Lighthouse timings on a shared host are not stable enough to gate; treat these as trend signals.",
  "",
  rows
    .flatMap((row) => (row.metricWarnings ?? []).map((w) => `- \`${row.page.path}\`: ${w}`))
    .join("\n") || "None.",
  "",
];

await writeFile(path.join(outDir, "summary.md"), lines.join("\n"));
console.log(`\nWrote ${path.join(outDir, "summary.md")}`);

if (budgetMode === "strict" && breachCount > 0) {
  console.error(`\n${breachCount} budget breach(es).`);
  process.exit(1);
}
