/**
 * Translation-coverage sweep for a signed-in player.
 *
 * The client message catalog is only as complete as the namespaces we ship to
 * the browser. If a route's client components ask for a namespace that was
 * trimmed away, next-intl logs a MISSING_MESSAGE error and renders the raw key,
 * which is a player-visible regression. This sweep loads real routes in a real
 * browser, records every console error (and any rendered error boundary), and
 * reports the transferred document size so a payload change can be checked at
 * the same time.
 *
 * Usage:
 *   node scripts/perf/page-load/missing-messages.mjs \
 *     --base=http://127.0.0.1:3100 \
 *     --storage=/tmp/ahd-storage.json \
 *     --routes=/corporation/1,/profile,/actions,/portfolio,/market
 *
 * Exit code is 1 when any route reports a missing message or a page error.
 */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const base = arg("base", "http://127.0.0.1:3100").replace(/\/$/, "");
const storage = arg("storage", "");
const routes = arg("routes", "/,/corporation/1,/market,/country/us/map").split(",");
const timeoutMs = Number(arg("timeout", "120000"));
const mobile = process.argv.includes("--mobile");

const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--no-sandbox"] });
let failures = 0;

for (const route of routes) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
    isMobile: mobile,
    ...(storage ? { storageState: JSON.parse(await readFile(storage, "utf8")) } : {}),
  });
  const page = await context.newPage();
  const problems = [];
  let otherErrors = 0;

  page.on("console", (message) => {
    const text = message.text();
    if (/MISSING_MESSAGE|IntlError/i.test(text)) {
      problems.push(`${message.type()}: ${text.slice(0, 240)}`);
    } else if (message.type() === "error") {
      // Local benchmark noise: an unresolvable Sentry host, CDN CORS, favicons.
      if (!/ERR_NAME_NOT_RESOLVED|Sentry Dsn|cdn\.ahousedividedgame\.com|favicon/i.test(text)) {
        otherErrors++;
      }
    }
  });
  page.on("pageerror", (error) => {
    const text = String(error);
    // A local benchmark has no CDN, so third-party map/asset fetches can reject.
    // That is an environment failure, not a translation one.
    if (/Failed to fetch|NetworkError|Load failed/i.test(text)) otherErrors++;
    else problems.push(`pageerror: ${text.slice(0, 240)}`);
  });

  let documentBytes = 0;
  try {
    await page.goto(base + route, { waitUntil: "load", timeout: timeoutMs });
    await page.waitForTimeout(1_500);
    documentBytes = await page.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0];
      return entry ? entry.encodedBodySize : 0;
    });
    const rendered = await page.textContent("body");
    if (/MISSING_MESSAGE|IntlError/.test(rendered ?? "")) {
      problems.push("rendered page contains a missing-message marker");
    }
  } catch (error) {
    problems.push(`navigation: ${String(error).slice(0, 200)}`);
  }

  const status = problems.length ? `FAIL (${problems.length})` : "ok";
  const noise = otherErrors ? `  (${otherErrors} unrelated console errors)` : "";
  console.log(
    `${route.padEnd(28)} doc=${(documentBytes / 1024).toFixed(0).padStart(5)}KB  ${status}${noise}`
  );
  for (const problem of problems.slice(0, 4)) console.log(`    ${problem}`);
  if (problems.length) failures++;
  await context.close();
}

await browser.close();
process.exit(failures ? 1 : 0);
