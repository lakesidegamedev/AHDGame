#!/usr/bin/env node
/**
 * Regenerates the landing globe poster in public/landing from a real render.
 *
 *   node scripts/landing/capture-globe-poster.mjs --base=<origin> [--era=2027]
 *     [--chrome-path=<chrome>]
 *
 * Opens the landing page with reduced motion (the globe holds its first
 * rotation frame), resizes the globe box to a square and screenshots just that
 * box. Run it again whenever the era look or markers change, then commit the
 * four files it writes. Needs `playwright` and a Chrome binary.
 */
import path from "node:path";
import process from "node:process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const base = arg("base", "http://127.0.0.1:3000").replace(/\/$/, "");
const era = arg("era", "2027");
const chromePath = arg("chrome-path", process.env.CHROME_PATH || undefined);
const outDir = path.resolve("public/landing");
const SIDE = 1200;

const browser = await chromium.launch({ executablePath: chromePath, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: SIDE + 100, height: SIDE + 100 },
    reducedMotion: "reduce",
  });
  await page.goto(`${base}/`, { waitUntil: "load" });
  const box = page.locator('div[class*="130vmax"]').first();
  await box.waitFor({ state: "attached" });
  await box.locator("svg, canvas").first().waitFor({ state: "attached", timeout: 30_000 });
  await box.evaluate((el, side) => {
    el.style.width = `${side}px`;
    el.style.height = `${side}px`;
    el.style.left = "50%";
    el.style.top = "50%";
  }, SIDE);
  await page.addStyleTag({
    content: `html, body { background: transparent !important; }
      body * { visibility: hidden !important; }
      div[class*="130vmax"], div[class*="130vmax"] * { visibility: visible !important; }`,
  });
  // Live player-count chips would be stale the moment the poster is cached.
  await box.evaluate((el) => {
    for (const node of el.querySelectorAll("div, g, foreignObject, span")) {
      if (/\bplaying\b/.test(node.textContent ?? "") && (node.textContent ?? "").length < 60) {
        node.style.setProperty("display", "none", "important");
      }
    }
  });
  await page.waitForTimeout(4_000);
  const png = await box.screenshot({ omitBackground: true });
  await mkdir(outDir, { recursive: true });
  for (const width of [640, 1200]) {
    const image = sharp(png).resize({ width });
    await image
      .clone()
      .webp({ quality: 70 })
      .toFile(path.join(outDir, `globe-${era}-${width}.webp`));
    await image
      .clone()
      .avif({ quality: 50 })
      .toFile(path.join(outDir, `globe-${era}-${width}.avif`));
  }
} finally {
  await browser.close();
}
