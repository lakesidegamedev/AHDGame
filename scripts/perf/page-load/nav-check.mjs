/**
 * Client-navigation message check.
 *
 * The root layout persists across App Router navigations, so a message catalog
 * supplied there is not re-sent when the player moves to another route. A
 * trimmed catalog is therefore only safe if something in the navigation path
 * re-supplies messages. This script loads `--from`, then clicks through to
 * `--to`, and reports any MISSING_MESSAGE / IntlError that appears only after
 * the client-side navigation.
 *
 * Usage:
 *   node scripts/perf/page-load/nav-check.mjs \
 *     --base=http://127.0.0.1:3100 --storage=/tmp/ahd-player.json \
 *     --from=/market --to=/portfolio
 */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const base = arg("base", "http://127.0.0.1:3100").replace(/\/$/, "");
const from = arg("from", "/market");
const to = arg("to", "/portfolio");
const storage = arg("storage", "");
const timeoutMs = Number(arg("timeout", "120000"));

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  ...(storage ? { storageState: JSON.parse(await readFile(storage, "utf8")) } : {}),
});
const page = await context.newPage();
const problems = [];

page.on("console", (message) => {
  if (/MISSING_MESSAGE|IntlError/i.test(message.text())) {
    problems.push(`${message.type()}: ${message.text().slice(0, 200)}`);
  }
});
page.on("pageerror", (error) => {
  if (!/Failed to fetch|NetworkError|Load failed/i.test(String(error))) {
    problems.push(`pageerror: ${String(error).slice(0, 200)}`);
  }
});

await page.goto(base + from, { waitUntil: "load", timeout: timeoutMs });
await page.waitForTimeout(1_500);
const before = problems.length;

const selector = `a[href="${to}"], a[href^="${to}/"], a[href^="${to}?"]`;
const link = await page.$(selector);
if (!link) {
  console.log(`no link from ${from} to ${to}; cannot exercise client navigation`);
  await browser.close();
  process.exit(2);
}

// Wait for hydration: Next only intercepts a Link click once React has attached
// its props. Without this the click becomes a full document load and the check
// silently proves nothing.
await page
  .waitForFunction(
    (css) => {
      const anchor = document.querySelector(css);
      if (!anchor) return false;
      return Object.keys(anchor).some((key) => key.startsWith("__reactProps"));
    },
    selector,
    { timeout: 30_000 }
  )
  .catch(() => {});

let documentRequests = 0;
page.on("request", (request) => {
  if (request.resourceType() === "document") documentRequests++;
});

try {
  await link.click({ timeout: 5_000 });
} catch {
  // The link can live in a menu that is hidden until opened; a synthetic click
  // still exercises the client router.
  await link.evaluate((element) => element.click());
}
await page.waitForTimeout(2_500);

const after = problems.slice(before);
const landed = new URL(page.url()).pathname;
console.log(`navigation ${from} -> ${to}: landed on ${landed}`);
console.log(
  `  ${documentRequests === 0 ? "client-side (no document request)" : `FULL PAGE LOAD (${documentRequests} document requests)`}`
);
console.log(`  missing-message errors after navigation: ${after.length}`);
for (const problem of after.slice(0, 5)) console.log(`    ${problem}`);
if (documentRequests > 0) {
  console.log("  note: a full load proves nothing about client navigation; pick a router link.");
  process.exit(2);
}

await browser.close();
process.exit(after.length ? 1 : 0);
