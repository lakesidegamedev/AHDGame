/** Function declarations under src/lib/constants may only shrink. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export type FunctionCounts = Record<string, number>;

export interface ConstantsFunctionBaseline {
  note: string;
  files: FunctionCounts;
}

export const BASELINE_PATH = join(
  "scripts",
  "architecture",
  "constantsFunctionRatchet.baseline.json"
);
const SCAN_ROOT = "src/lib/constants";
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts)$/;
const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?tsx?$|\.d\.ts$)/;
const TEST_DIR = /(?:^|\/)(?:__tests__|__mocks__|__fixtures__)\//;

export function isScannedFile(file: string): boolean {
  return (
    file.startsWith(`${SCAN_ROOT}/`) &&
    SOURCE_EXT.test(file) &&
    !TEST_FILE.test(file) &&
    !TEST_DIR.test(file)
  );
}

/** Count `function` declarations at any depth. Arrow functions and re-exports are not counted. */
export function countFunctionDeclarations(source: string, file: string): number {
  if (!/\bfunction\b/.test(source)) return 0;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  let count = 0;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node)) count++;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return count;
}

export function scanRepo(root = process.cwd()): FunctionCounts {
  const listed = execFileSync("git", ["ls-files", "-z", SCAN_ROOT], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter(isScannedFile);
  const out: FunctionCounts = {};
  for (const file of listed) {
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const count = countFunctionDeclarations(source, file);
    if (count > 0) out[file] = count;
  }
  return out;
}

export interface Regression {
  file: string;
  baseline: number;
  current: number;
}

/** Any count above its baseline; a file missing from the baseline counts as 0. */
export function findRegressions(baseline: FunctionCounts, current: FunctionCounts): Regression[] {
  const out: Regression[] = [];
  for (const [file, count] of Object.entries(current)) {
    const base = baseline[file] ?? 0;
    if (count > base) out.push({ file, baseline: base, current: count });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** Lower each entry to the current count. Never raises a count or adds a file. */
export function lowerBaseline(baseline: FunctionCounts, current: FunctionCounts): FunctionCounts {
  const out: FunctionCounts = {};
  for (const [file, base] of Object.entries(baseline)) {
    const lowered = Math.min(base, current[file] ?? 0);
    if (lowered > 0) out[file] = lowered;
  }
  return out;
}

export function total(counts: FunctionCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

const BASELINE_NOTE =
  "Constants function ratchet. Function declarations under src/lib/constants may only go down per file. Rules belong in a rules/ module beside their system with a forwarder here; after moving functions run `npm run constants-functions:lower`.";

export function readBaseline(root = process.cwd()): ConstantsFunctionBaseline {
  return JSON.parse(readFileSync(join(root, BASELINE_PATH), "utf8")) as ConstantsFunctionBaseline;
}

export function writeBaseline(files: FunctionCounts, root = process.cwd()): void {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const body: ConstantsFunctionBaseline = { note: BASELINE_NOTE, files: sorted };
  writeFileSync(join(root, BASELINE_PATH), JSON.stringify(body, null, 2) + "\n");
}
