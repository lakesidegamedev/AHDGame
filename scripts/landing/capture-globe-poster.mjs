#!/usr/bin/env node
/**
 * Regenerates the landing globe posters in public/landing from the real
 * renderer (src/components/landing/globe). No network or running site needed.
 *
 *   node scripts/landing/capture-globe-poster.mjs [--era=2027]
 *     [--chrome-path=<chrome>]
 *
 * Bundles the renderer with esbuild, draws the globe in headless Chrome once
 * per three-hour UTC bucket (sun on the equinox, centred in the bucket) and
 * writes `globe-<era>-h<bucket>-960.{avif,webp}`. Run it again, and commit the
 * files, whenever the globe's look, tiers or first rotation change.
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build } from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const era = arg("era", "2027");
const chromePath = arg("chrome-path", process.env.CHROME_PATH || undefined);
const root = process.cwd();
const outDir = path.resolve("public/landing");
const SIDE = 960;
const BUCKET_HOURS = 3;

const entry = `
import { buildScene, renderGlobe } from "@/components/landing/globe/litGlobe";
import { subsolarPoint } from "@/components/landing/globe/sun";
import { buildTierLookup } from "@/components/landing/countryTiers";
import { getEraConfig } from "@/components/landing/eraThemes";
import { battlegroundFeatureIdsForEra, economicPowerFeatureIdsForEra } from "@/components/landing/countryTierRosters";
import { ISO_TO_COUNTRY_ID } from "@/app/world/worldMetricHighlight";
import { backgroundMacroFeatureIdsForPreset } from "@/lib/world/worldEntityMap";

window.drawGlobe = async (era, hourUtc) => {
  const config = getEraConfig(era);
  const topology = await (await fetch("/world.json")).json();
  const tiers = buildTierLookup(ISO_TO_COUNTRY_ID, config.accessMap, battlegroundFeatureIdsForEra(config.id), economicPowerFeatureIdsForEra(config.id));
  const macro = new Set(backgroundMacroFeatureIdsForPreset(config.id + "-default"));
  const scene = buildScene(topology, (id) => {
    const tier = tiers.get(id) ?? "background";
    return tier === "background" && macro.has(id) ? "macro" : tier;
  });
  const canvas = document.getElementById("c");
  canvas.width = canvas.height = ${SIDE};
  const ctx = canvas.getContext("2d");
  const at = new Date(Date.UTC(2026, 2, 20, Math.floor(hourUtc), (hourUtc % 1) * 60));
  renderGlobe(ctx, scene, {
    rotation: config.initialRotation ?? [48, -30, 0],
    radius: ${SIDE} * 0.2375 * 1.05,
    cx: ${SIDE} / 2,
    cy: ${SIDE} / 2,
    dpr: 1,
    sun: subsolarPoint(at),
  });
};
`;

const bundle = await build({
  stdin: { contents: entry, resolveDir: root, loader: "ts", sourcefile: "poster-entry.ts" },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  tsconfig: path.join(root, "tsconfig.json"),
  logLevel: "error",
});
const script = bundle.outputFiles[0].text;
const world = await readFile(path.join(root, "public/geo/countries-110m.json"));

const server = createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.writeHead(200, { "content-type": "text/javascript" }).end(script);
  } else if (req.url === "/world.json") {
    res.writeHead(200, { "content-type": "application/json" }).end(world);
  } else {
    res
      .writeHead(200, { "content-type": "text/html" })
      .end('<body style="margin:0"><canvas id="c"></canvas><script src="/bundle.js"></script>');
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const browser = await chromium.launch({ executablePath: chromePath, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: SIDE, height: SIDE } });
  await page.goto(`http://127.0.0.1:${port}/`);
  await mkdir(outDir, { recursive: true });
  for (let bucket = 0; bucket < 24 / BUCKET_HOURS; bucket++) {
    const hour = bucket * BUCKET_HOURS + BUCKET_HOURS / 2;
    await page.evaluate(([e, h]) => window.drawGlobe(e, h), [era, hour]);
    const png = await page.locator("#c").screenshot({ omitBackground: true });
    const base = path.join(outDir, `globe-${era}-h${bucket}-${SIDE}`);
    await sharp(png).avif({ quality: 48 }).toFile(`${base}.avif`);
    await sharp(png).webp({ quality: 62 }).toFile(`${base}.webp`);
  }
} finally {
  await browser.close();
  server.close();
}
