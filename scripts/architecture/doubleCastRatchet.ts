/** Double casts through `unknown` outside tests may only shrink. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export type CastCounts = Record<string, number>;

export interface DoubleCastBaseline {
  note: string;
  files: CastCounts;
}

export const BASELINE_PATH = join("scripts", "architecture", "doubleCastRatchet.baseline.json");
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts)$/;
const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?tsx?$|TestDb\.[cm]?tsx?$|\.d\.ts$)/;
const TEST_DIR = /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|mocks|test-utils|test|tests)\//;

export function isScannedFile(file: string): boolean {
  return SOURCE_EXT.test(file) && !TEST_FILE.test(file) && !TEST_DIR.test(file);
}

/** Count `x as unknown as T` expressions, ignoring comments and strings. */
export function countDoubleCasts(source: string, file: string): number {
  if (!/\bas\s+unknown\b/.test(source)) return 0;
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    false,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  let count = 0;
  const visit = (node: ts.Node) => {
    if (
      ts.isAsExpression(node) &&
      ts.isAsExpression(node.expression) &&
      node.expression.type.kind === ts.SyntaxKind.UnknownKeyword
    )
      count++;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return count;
}

export function scanRepo(root = process.cwd()): CastCounts {
  const listed = execFileSync("git", ["ls-files", "-z", "src"], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter(isScannedFile);
  const out: CastCounts = {};
  for (const file of listed) {
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const count = countDoubleCasts(source, file);
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
export function findRegressions(baseline: CastCounts, current: CastCounts): Regression[] {
  const out: Regression[] = [];
  for (const [file, count] of Object.entries(current)) {
    const base = baseline[file] ?? 0;
    if (count > base) out.push({ file, baseline: base, current: count });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** Lower each entry to the current count. Never raises a count or adds a file. */
export function lowerBaseline(baseline: CastCounts, current: CastCounts): CastCounts {
  const out: CastCounts = {};
  for (const [file, base] of Object.entries(baseline)) {
    const lowered = Math.min(base, current[file] ?? 0);
    if (lowered > 0) out[file] = lowered;
  }
  return out;
}

export function total(counts: CastCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

const BASELINE_NOTE =
  "Double cast ratchet. `as unknown as` outside tests may only go down per file. Prefer a typed getter, a generic find<T>, or a narrow type guard; after removing casts run `npm run double-casts:lower`.";

export function readBaseline(root = process.cwd()): DoubleCastBaseline {
  return JSON.parse(readFileSync(join(root, BASELINE_PATH), "utf8")) as DoubleCastBaseline;
}

export function writeBaseline(files: CastCounts, root = process.cwd()): void {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const body: DoubleCastBaseline = { note: BASELINE_NOTE, files: sorted };
  writeFileSync(join(root, BASELINE_PATH), JSON.stringify(body, null, 2) + "\n");
}
