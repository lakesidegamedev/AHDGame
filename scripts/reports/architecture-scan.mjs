/**
 * Prints the 1.20 architecture baseline measures for the checkout it runs in.
 *
 *   node scripts/reports/architecture-scan.mjs                 # markdown table
 *   node scripts/reports/architecture-scan.mjs --json          # raw numbers
 *   node scripts/reports/architecture-scan.mjs --before a.json # table with a before column
 *
 * Run it in a worktree of the baseline commit and in the current checkout with
 * `--json`, then pass the baseline file as `--before` so both columns come from
 * the same method. Counts come from tracked files only.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SOURCE_EXT = /\.(ts|tsx|mjs|js)$/;
const TEST_FILE = /(\.test\.|\.spec\.|__tests__|\.stories\.)/;
const WINDOW = 12;

function trackedFiles(dir) {
  const out = execFileSync("git", ["ls-files", dir], { encoding: "utf8", maxBuffer: 1 << 28 });
  return out.split("\n").filter(Boolean);
}

function read(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** Counts lines that are only comment text, tracking block comments across lines. */
function commentLineCount(lines) {
  let inBlock = false;
  let count = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (inBlock) {
      count += 1;
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    if (line.startsWith("//")) count += 1;
    else if (line.startsWith("/*")) {
      count += 1;
      if (!line.includes("*/")) inBlock = true;
    }
  }
  return count;
}

function lineHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** One 32-bit hash per meaningful line: blank lines and line comments are skipped. */
function normalizedHashes(lines) {
  const out = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (l.length > 3 && !l.startsWith("//")) out.push(lineHash(l));
  }
  return out;
}

/** A 53-bit key for every run of WINDOW consecutive meaningful lines. */
function* windowKeys(hashes) {
  for (let i = 0; i + WINDOW <= hashes.length; i += 1) {
    let h1 = 0;
    let h2 = 0;
    for (let k = 0; k < WINDOW; k += 1) {
      h1 = (Math.imul(h1, 31) + hashes[i + k]) >>> 0;
      h2 = (Math.imul(h2, 131) ^ hashes[i + k]) >>> 0;
    }
    yield h1 * 2097152 + (h2 & 2097151);
  }
}

const files = trackedFiles("src").filter((f) => SOURCE_EXT.test(f) && !TEST_FILE.test(f));
const allCode = [...trackedFiles("src"), ...trackedFiles("scripts")].filter((f) =>
  SOURCE_EXT.test(f)
);

let sourceLines = 0;
let over1500 = 0;
let over2000 = 0;
let commentLines = 0;
let getDbImporters = 0;
let collectionSites = 0;
let doubleCasts = 0;
let anyUses = 0;
let emptyCatches = 0;
let eslintDisables = 0;
let consoleCalls = 0;
const windowCounts = new Map();
const fileHashes = [];

for (const file of files) {
  const text = read(file);
  const lines = text.split("\n");
  const n = text.endsWith("\n") ? lines.length - 1 : lines.length;
  sourceLines += n;
  if (n > 1500) over1500 += 1;
  if (n > 2000) over2000 += 1;
  commentLines += commentLineCount(lines);
  if (/\bgetDb\b/.test(text) && /import[^;]*\bgetDb\b/s.test(text)) getDbImporters += 1;
  collectionSites += (text.match(/\bdb\.collection\b/g) ?? []).length;
  doubleCasts += (text.match(/\bas unknown as\b/g) ?? []).length;
  anyUses += (text.match(/(:\s*any\b|\bas any\b|<any>)/g) ?? []).length;
  emptyCatches += (text.match(/catch\s*(\([^)]*\))?\s*\{\s*\}/g) ?? []).length;
  eslintDisables += (text.match(/eslint-disable/g) ?? []).length;
  consoleCalls += (text.match(/\bconsole\.(log|warn|error|info|debug)\(/g) ?? []).length;

  const hashes = normalizedHashes(lines);
  fileHashes.push(hashes);
  for (const key of windowKeys(hashes)) windowCounts.set(key, (windowCounts.get(key) ?? 0) + 1);
}

// A line counts once however many duplicate windows cover it.
let duplicatedLines = 0;
for (const hashes of fileHashes) {
  const marks = new Uint8Array(hashes.length);
  let i = 0;
  for (const key of windowKeys(hashes)) {
    if (windowCounts.get(key) > 1) marks.fill(1, i, i + WINDOW);
    i += 1;
  }
  for (const m of marks) duplicatedLines += m;
}

// Unused export candidates: an exported name that appears in no other file.
const exportsByFile = new Map();
const nameFiles = new Map();
for (const file of allCode) {
  const text = read(file);
  if (!TEST_FILE.test(file) && file.startsWith("src/")) {
    const names = [
      ...text.matchAll(
        /^export\s+(?:async\s+)?(?:function\*?|const|let|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)/gm
      ),
    ].map((m) => m[1]);
    if (names.length > 0) exportsByFile.set(file, names);
  }
  for (const word of new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? [])) {
    let set = nameFiles.get(word);
    if (!set) nameFiles.set(word, (set = new Set()));
    set.add(file);
  }
}
let unusedExports = 0;
for (const [file, names] of exportsByFile) {
  for (const name of names) {
    const users = nameFiles.get(name);
    if (!users || [...users].every((f) => f === file)) unusedExports += 1;
  }
}

const getters = trackedFiles("src/lib/db/collections").filter(
  (f) => f.endsWith(".ts") && !TEST_FILE.test(f)
).length;

const result = {
  sourceLines,
  sourceFiles: files.length,
  over1500,
  over2000,
  commentLines,
  commentShare: Number(((commentLines / sourceLines) * 100).toFixed(1)),
  duplicatedLines,
  unusedExports,
  getDbImporters,
  collectionSites,
  collectionGetterFiles: getters,
  doubleCasts,
  anyUses,
  emptyCatches,
  eslintDisables,
  consoleCalls,
};

const args = process.argv.slice(2);
if (args.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const beforeIdx = args.indexOf("--before");
  const before = beforeIdx >= 0 ? JSON.parse(readFileSync(args[beforeIdx + 1], "utf8")) : null;
  const fmt = (v) => (v === undefined ? "n/a" : v.toLocaleString("en-US"));
  const row = (label, keys) => {
    const cells = (src) => (src ? keys.map((k) => fmt(src[k])).join(" / ") : "");
    return before
      ? `| ${label} | ${cells(before)} | ${cells(result)} |`
      : `| ${label} | ${cells(result)} |`;
  };
  console.log(
    before
      ? "| Measure | Before | After |\n| --- | --- | --- |"
      : "| Measure | Value |\n| --- | --- |"
  );
  console.log(row("Source lines (non-test)", ["sourceLines"]));
  console.log(row("Source files (non-test)", ["sourceFiles"]));
  console.log(row("Files over 1,500 / 2,000 lines", ["over1500", "over2000"]));
  console.log(row("Comment lines", ["commentLines"]));
  console.log(row("Duplicated lines (12-line windows)", ["duplicatedLines"]));
  console.log(row("Unused export candidates", ["unusedExports"]));
  console.log(row("getDb() importers", ["getDbImporters"]));
  console.log(row("Direct db.collection() call sites", ["collectionSites"]));
  console.log(row("Collection getter files", ["collectionGetterFiles"]));
  console.log(row("as unknown as", ["doubleCasts"]));
  console.log(row("any", ["anyUses"]));
  console.log(row("Empty catch", ["emptyCatches"]));
  console.log(row("eslint-disable", ["eslintDisables"]));
  console.log(row("console.* calls", ["consoleCalls"]));
}
