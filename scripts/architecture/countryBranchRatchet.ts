import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_COUNTRY_IDS } from "../../src/lib/constants/countries";

export type BranchCounts = Record<string, number>;

export interface BranchBaseline {
  note: string;
  files: BranchCounts;
}

export const BASELINE_PATH = join("scripts", "architecture", "countryBranchRatchet.baseline.json");
const SCAN_ROOT = "src";
const SCAN_EXT = /\.(?:ts|tsx|mts)$/;
const TEST_FILE = /\.test\.(?:ts|tsx)$/;
const COUNTRY_FOLDER = "src/lib/countries/";

const codes = ALL_COUNTRY_IDS.join("|");
const BRANCH = new RegExp(
  [
    `(?:===|!==)\\s*["'](?:${codes})["']`,
    `["'](?:${codes})["']\\s*(?:===|!==)`,
    `\\bcase\\s+["'](?:${codes})["']\\s*:`,
  ].join("|"),
  "g"
);

/** Literal country-code comparisons and `case "XX":` labels in a source string. */
export function countCountryBranches(source: string): number {
  return source.match(BRANCH)?.length ?? 0;
}

/** Whether a repo-relative path is covered. Country folders and tests are exempt. */
export function isScanned(file: string): boolean {
  return SCAN_EXT.test(file) && !TEST_FILE.test(file) && !file.startsWith(COUNTRY_FOLDER);
}

export function scanRepo(root = process.cwd()): BranchCounts {
  const listed = execFileSync("git", ["ls-files", "-z", SCAN_ROOT], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter(isScanned);
  const out: BranchCounts = {};
  for (const file of listed) {
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const count = countCountryBranches(source);
    if (count > 0) out[file] = count;
  }
  return out;
}

export interface BranchRegression {
  file: string;
  baseline: number;
  current: number;
}

/** Any file whose count rose above its baseline (an absent file has baseline 0). */
export function findRegressions(baseline: BranchCounts, current: BranchCounts): BranchRegression[] {
  return Object.entries(current)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => ({ file, baseline: baseline[file] ?? 0, current: count }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

/** Lower each baseline entry to the current count. Never raises a count or adds a file. */
export function lowerBaseline(baseline: BranchCounts, current: BranchCounts): BranchCounts {
  const out: BranchCounts = {};
  for (const [file, base] of Object.entries(baseline)) {
    const next = Math.min(base, current[file] ?? 0);
    if (next > 0) out[file] = next;
  }
  return out;
}

const BASELINE_NOTE =
  "Literal country-code branches outside src/lib/countries. Counts may only go down. Move the rule into the country folder, then run `npm run country-branches:lower`.";

export function readBaseline(root = process.cwd()): BranchBaseline {
  return JSON.parse(readFileSync(join(root, BASELINE_PATH), "utf8")) as BranchBaseline;
}

export function writeBaseline(files: BranchCounts, root = process.cwd()): void {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const body: BranchBaseline = { note: BASELINE_NOTE, files: sorted };
  writeFileSync(join(root, BASELINE_PATH), JSON.stringify(body, null, 2) + "\n");
}
