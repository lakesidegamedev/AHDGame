/**
 * Downloads logos for the real company table from Wikimedia Commons, pads each
 * onto a square canvas and writes the name-to-file manifest the game reads.
 * Files already on disk are kept. Run: npx tsx scripts/seed/fetchCompanyLogos.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  REAL_BANK_ENTRIES,
  REAL_COMPANY_ENTRIES,
} from "../../src/lib/corporations/names/realCompanies";

const OUT_DIR = path.resolve("public/company-logos");
const MANIFEST = path.resolve("src/lib/corporations/names/companyLogos.json");
const HEADERS = { "User-Agent": "company-logo-fetch/1.0 (generic client)" };
const SIZE = 160;
const PAD = 14;

interface Entry {
  name: string;
  title: string;
}

interface WikidataEntity {
  claims?: { P154?: { mainsnak?: { datavalue?: { value?: unknown } } }[] };
}

function parse(entry: string): Entry {
  const [name, title] = entry.split("|");
  return { name: name!, title: title ?? name! };
}

function slug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json();
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter + 2 : 10) * 1000);
  }
  return null;
}

function logoFile(entity: WikidataEntity | undefined): string | null {
  const files = (entity?.claims?.P154 ?? [])
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter((value): value is string => typeof value === "string");
  return files.find((file) => /\.svg$/i.test(file)) ?? files[0] ?? null;
}

/** Article titles (redirects followed) to Wikidata items, then items to logo files. */
async function lookupByTitles(titles: string[]): Promise<Map<string, string>> {
  const itemByTitle = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await getJson(
      "https://en.wikipedia.org/w/api.php?action=query&redirects=1&prop=pageprops" +
        "&ppprop=wikibase_item&format=json&titles=" +
        encodeURIComponent(batch.join("|"))
    );
    const alias = new Map<string, string>();
    for (const step of [...(data?.query?.normalized ?? []), ...(data?.query?.redirects ?? [])]) {
      alias.set(step.from, step.to);
    }
    const itemByPage = new Map<string, string>();
    for (const page of Object.values<{ title?: string; pageprops?: { wikibase_item?: string } }>(
      data?.query?.pages ?? {}
    )) {
      const item = page?.pageprops?.wikibase_item;
      if (page?.title && item) itemByPage.set(page.title, item);
    }
    for (const title of batch) {
      let resolved = title;
      for (let hop = 0; hop < 3 && alias.has(resolved); hop++) resolved = alias.get(resolved)!;
      const item = itemByPage.get(resolved);
      if (item) itemByTitle.set(title, item);
    }
    await sleep(2500);
  }
  const fileByItem = new Map<string, string>();
  const items = [...new Set(itemByTitle.values())];
  for (let i = 0; i < items.length; i += 50) {
    const data = await getJson(
      "https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=" +
        items.slice(i, i + 50).join("%7C")
    );
    for (const [id, entity] of Object.entries<WikidataEntity>(data?.entities ?? {})) {
      const file = logoFile(entity);
      if (file) fileByItem.set(id, file);
    }
    await sleep(2500);
  }
  const found = new Map<string, string>();
  for (const [title, item] of itemByTitle) {
    const file = fileByItem.get(item);
    if (file) found.set(title, file);
  }
  return found;
}

async function download(file: string, target: string): Promise<boolean> {
  const url =
    "https://commons.wikimedia.org/wiki/Special:FilePath/" +
    encodeURIComponent(file.replace(/ /g, "_")) +
    "?width=320";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
    if (res.ok) {
      const input = Buffer.from(await res.arrayBuffer());
      const inner = SIZE - PAD * 2;
      const mark = await sharp(input).resize(inner, inner, { fit: "inside" }).png().toBuffer();
      await sharp({
        create: { width: SIZE, height: SIZE, channels: 4, background: "#ffffff" },
      })
        .composite([{ input: mark, gravity: "centre" }])
        .png({ palette: true, compressionLevel: 9 })
        .toFile(target);
      return true;
    }
    if (res.status !== 429 && res.status < 500) return false;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter + 2 : 8) * 1000);
  }
  return false;
}

async function main() {
  const entries: Entry[] = [
    ...Object.values(REAL_COMPANY_ENTRIES).flatMap((table) => Object.values(table).flat()),
    ...Object.values(REAL_BANK_ENTRIES).flat(),
  ].map(parse);
  await mkdir(OUT_DIR, { recursive: true });
  const manifest: Record<string, string> = existsSync(MANIFEST)
    ? JSON.parse(await readFile(MANIFEST, "utf8"))
    : {};
  const saveManifest = async () => {
    const sorted = Object.fromEntries(
      Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))
    );
    await writeFile(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
    return Object.keys(sorted).length;
  };
  const byTitle = await lookupByTitles(entries.map((entry) => entry.title));
  const misses: string[] = [];
  let done = 0;
  for (const entry of entries) {
    const fileName = `${slug(entry.name)}.png`;
    const target = path.join(OUT_DIR, fileName);
    let ok = existsSync(target);
    const file = byTitle.get(entry.title);
    if (!ok && file) {
      try {
        ok = await download(file, target);
      } catch {
        ok = false;
      }
      await sleep(600);
    }
    if (ok) manifest[entry.name] = `/company-logos/${fileName}`;
    else misses.push(entry.name);
    done += 1;
    if (done % 25 === 0) await saveManifest();
  }
  const count = await saveManifest();
  console.log(`logos: ${count}/${entries.length}; missing: ${misses.join(", ")}`);
}

void main();
