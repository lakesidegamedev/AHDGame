/**
 * Client message-namespace analyzer.
 *
 * The root layout serialises the message catalog into `NextIntlClientProvider`.
 * Shipping the whole thing costs ~70 KB gzipped per document, so
 * `src/i18n/clientCatalog.ts` narrows it for known routes. This script produces
 * the namespace sets that map is built from: it walks static and dynamic
 * imports from the root layout plus each subtree's `page.tsx` / `layout.tsx`,
 * and collects every `useTranslations("<namespace>")` it can reach.
 *
 * Usage:
 *   node scripts/i18n/client-namespaces.mjs [--dir=corporation,profile,...]
 *
 * The output is the set to put in `CLIENT_CATALOG_RULES`, plus the shell set.
 * Server components are not part of the decision: they translate through
 * `getTranslations`, which never reads the client catalog.
 *
 * Caveat: this is a static reachability analysis. It cannot see components
 * chosen through a runtime string registry, which is why a route only joins the
 * map after `scripts/perf/page-load/missing-messages.mjs` passes against it.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.tsx"];

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

function resolveImport(specifier, fromDir) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(root, "src", specifier.slice(2));
  else if (specifier.startsWith("./") || specifier.startsWith("../"))
    base = path.resolve(fromDir, specifier);
  else return null;

  for (const extension of extensions) {
    const candidate = base + extension;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const fileCache = new Map();
function read(file) {
  if (!fileCache.has(file)) {
    fileCache.set(file, fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  }
  return fileCache.get(file);
}

const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function analyze(entries) {
  const seen = new Set();
  const namespaces = new Set();
  let needsAll = false;
  const queue = [...entries];

  while (queue.length) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    // This module documents the pattern it looks for, so scanning it would
    // count its own docstring as a namespace.
    if (file === path.join(root, "src/i18n/clientCatalog.ts")) continue;
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;

    const source = read(file);
    for (const match of source.matchAll(/useTranslations\s*\(\s*(?:["']([^"']+)["'])?\s*\)/g)) {
      if (match[1]) namespaces.add(match[1].split(".")[0]);
      else needsAll = true;
    }

    for (const pattern of [STATIC_IMPORT, DYNAMIC_IMPORT]) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1];
        if (
          !specifier.startsWith("@/") &&
          !specifier.startsWith("./") &&
          !specifier.startsWith("../")
        ) {
          continue;
        }
        const resolved = resolveImport(specifier, path.dirname(file));
        if (resolved) queue.push(resolved);
      }
    }
  }

  return { files: seen.size, namespaces: [...namespaces].sort(), needsAll };
}

const shell = analyze(["src/app/layout.tsx"]);
console.log(`shell: files=${shell.files} needsWholeCatalog=${shell.needsAll}`);
console.log(`  namespaces: ${shell.namespaces.join(", ") || "(none)"}`);

const subtrees = arg("dir", "corporation,profile,actions,market,portfolio,elections,notifications")
  .split(",")
  .filter(Boolean);

for (const dir of subtrees) {
  const sourceDir = `src/app/${dir}`;
  if (!fs.existsSync(sourceDir)) {
    console.log(`\n/${dir}: missing directory, skipped`);
    continue;
  }
  const entries = execSync(
    `find ${sourceDir} \\( -name 'page.tsx' -o -name 'layout.tsx' \\) -print`,
    { encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .filter(Boolean);

  const result = analyze([...entries, "src/app/layout.tsx"]);
  console.log(`\n/${dir}: pages=${entries.length} files=${result.files} needsWholeCatalog=${result.needsAll}`);
  console.log(
    `  namespaces: ${result.namespaces.join(", ")}`
  );
  console.log(
    `  rule: { prefix: "/${dir}", namespaces: [${result.namespaces
      .map((n) => `"${n}"`)
      .join(", ")}] }`
  );
}
