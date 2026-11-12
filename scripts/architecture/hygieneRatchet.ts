/**
 * Count-only hygiene ratchets over non-test `src` files. Each metric may only
 * shrink per file: console calls, empty catch blocks, eslint-disable comments,
 * explicit `any` and one-line re-export forwarder files.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export const METRICS = [
  "console",
  "emptyCatch",
  "eslintDisable",
  "explicitAny",
  "forwarder",
] as const;
export type Metric = (typeof METRICS)[number];

export type FileCounts = Record<string, number>;
export type MetricCounts = Record<Metric, FileCounts>;

export interface HygieneBaseline {
  note: string;
  metrics: MetricCounts;
}

export const BASELINE_PATH = join("scripts", "architecture", "hygieneRatchet.baseline.json");
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts)$/;
const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?tsx?$|TestDb\.[cm]?tsx?$|\.d\.ts$)/;
const TEST_DIR = /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|mocks|test-utils|test|tests)\//;

export function isScannedFile(file: string): boolean {
  return SOURCE_EXT.test(file) && !TEST_FILE.test(file) && !TEST_DIR.test(file);
}

export function emptyCounts(): MetricCounts {
  return { console: {}, emptyCatch: {}, eslintDisable: {}, explicitAny: {}, forwarder: {} };
}

function scriptKind(file: string): ts.ScriptKind {
  return file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/** `eslint-disable*` directives that live in comments (not strings). */
export function countEslintDisables(source: string, file: string): number {
  if (!source.includes("eslint-disable")) return 0;
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    file.endsWith(".tsx") ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    source
  );
  let count = 0;
  for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scanner.scan()) {
    if (
      (t === ts.SyntaxKind.SingleLineCommentTrivia || t === ts.SyntaxKind.MultiLineCommentTrivia) &&
      /\beslint-disable/.test(scanner.getTokenText())
    )
      count++;
  }
  return count;
}

function isForwarder(ast: ts.SourceFile): boolean {
  const body = ast.statements;
  return (
    body.length > 0 &&
    body.every((s) => ts.isExportDeclaration(s) && s.moduleSpecifier !== undefined)
  );
}

/** Per-metric counts for one file. Zero counts are omitted by the caller. */
export function countFile(source: string, file: string): Record<Metric, number> {
  const out: Record<Metric, number> = {
    console: 0,
    emptyCatch: 0,
    eslintDisable: countEslintDisables(source, file),
    explicitAny: 0,
    forwarder: 0,
  };
  const wantsAst = /\bconsole\b|\bcatch\b|\bany\b|\bexport\b/.test(source);
  if (!wantsAst) return out;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, scriptKind(file));
  if (source.length < 2000 && isForwarder(ast)) out.forwarder = 1;
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) out.explicitAny++;
    else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "console"
    )
      out.console++;
    else if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      // A comment inside the block documents an intentional ignore.
      const inner = source.slice(node.block.getStart(ast) + 1, node.block.getEnd() - 1);
      if (inner.trim() === "") out.emptyCatch++;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return out;
}

export function scanRepo(root = process.cwd()): MetricCounts {
  const listed = execFileSync("git", ["ls-files", "-z", "src"], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter(isScannedFile);
  const out = emptyCounts();
  for (const file of listed) {
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const counts = countFile(source, file);
    for (const m of METRICS) if (counts[m] > 0) out[m][file] = counts[m];
  }
  return out;
}

export interface Regression {
  metric: Metric;
  file: string;
  baseline: number;
  current: number;
}

/** Any count above its baseline; a file missing from the baseline counts as 0. */
export function findRegressions(baseline: MetricCounts, current: MetricCounts): Regression[] {
  const out: Regression[] = [];
  for (const metric of METRICS) {
    for (const [file, count] of Object.entries(current[metric])) {
      const base = baseline[metric][file] ?? 0;
      if (count > base) out.push({ metric, file, baseline: base, current: count });
    }
  }
  return out.sort((a, b) => a.metric.localeCompare(b.metric) || a.file.localeCompare(b.file));
}

/** Lower each entry to the current count. Never raises a count or adds a file. */
export function lowerBaseline(baseline: MetricCounts, current: MetricCounts): MetricCounts {
  const out = emptyCounts();
  for (const metric of METRICS) {
    for (const [file, base] of Object.entries(baseline[metric])) {
      const lowered = Math.min(base, current[metric][file] ?? 0);
      if (lowered > 0) out[metric][file] = lowered;
    }
  }
  return out;
}

export function total(counts: FileCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

const BASELINE_NOTE =
  "Hygiene ratchet. console calls, empty catch blocks, eslint-disable comments, explicit any and one-line re-export forwarder files in src (non-test) may only go down per file. After removing some run `npm run hygiene:lower`.";

export function readBaseline(root = process.cwd()): HygieneBaseline {
  return JSON.parse(readFileSync(join(root, BASELINE_PATH), "utf8")) as HygieneBaseline;
}

export function writeBaseline(metrics: MetricCounts, root = process.cwd()): void {
  const sorted = emptyCounts();
  for (const m of METRICS) {
    sorted[m] = Object.fromEntries(
      Object.entries(metrics[m]).sort(([a], [b]) => a.localeCompare(b))
    );
  }
  const body: HygieneBaseline = { note: BASELINE_NOTE, metrics: sorted };
  writeFileSync(join(root, BASELINE_PATH), JSON.stringify(body, null, 2) + "\n");
}

export const REMEDIATION: Record<Metric, string> = {
  console: "use the logger instead of console",
  emptyCatch: "handle the error, or add a comment saying why it is ignored",
  eslintDisable: "fix the lint finding instead of disabling the rule",
  explicitAny: "use a real type or unknown with a narrowing guard",
  forwarder: "import from the real module instead of adding a re-export file",
};
