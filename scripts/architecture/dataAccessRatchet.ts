/** Direct access to the busiest collections, and untyped `.collection()` calls, may only shrink. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/** Collections with a typed door in `src/lib/db/collections` or `src/lib/db/repositories`; new code must use it. */
export const FRONT_DOOR_COLLECTIONS = [
  "characters",
  "corporations",
  "gameState",
  "states",
  "electedOfficials",
  "politicalParties",
  "npps",
  "elections",
  "corporateSectors",
  "federalBudget",
  "bonds",
  "centralBanks",
  "financialTxLog",
  "bankLoans",
  "interbankLoans",
  "savingsAccounts",
  "savingsLedger",
  "ledgerEntries",
  "bankMoneyMoves",
  "indexFunds",
  "shareOrders",
  "currencyOrders",
  "stateBudgets",
  "imperialCharacters",
  "exchangeRates",
  "electionCandidates",
  "bills",
  "electionVoteTallies",
  "campaigns",
  "statePartyOrg",
  "countryGameStates",
  "legislationTypes",
  "crises",
  "governmentFormations",
  "unions",
  "coalitions",
  "users",
  "gameConfig",
  "macroMetrics",
  "stateDemographics",
  "unownedSectors",
  "statePolicies",
  "cabinetMembers",
  "stateDemographicTurnout",
  "commodityPrices",
  "stateBaselines",
  "enactedLaws",
  "cabinetNominations",
  "congressLeaders",
  "corporationHistory",
  "crisisInteractions",
  "adminLogs",
  "nationalPartyElections",
  "stateBills",
  "politicalMetrics",
  "notifications",
  "governmentApprovals",
  "activityLog",
] as const;

export const UNTYPED = "untyped";

/** Per file: direct calls per front-door collection, plus untyped `.collection()` calls. */
export type FileCounts = Record<string, number>;
export type AccessCounts = Record<string, FileCounts>;

export interface DataAccessBaseline {
  note: string;
  files: AccessCounts;
}

export const BASELINE_PATH = join("scripts", "architecture", "dataAccessRatchet.baseline.json");
const DOOR_DIRS = ["src/lib/db/collections/", "src/lib/db/repositories/"];
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts)$/;
const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?tsx?$|TestDb\.[cm]?tsx?$|\.d\.ts$)/;
const TEST_DIR =
  /(?:^|\/)(?:__tests__|__mocks__|__fixtures__|mocks|test-utils|test|tests|testing)\//;
const frontDoor = new Set<string>(FRONT_DOOR_COLLECTIONS);

export function isScannedFile(file: string): boolean {
  return SOURCE_EXT.test(file) && !TEST_FILE.test(file) && !TEST_DIR.test(file);
}

/** Count `.collection(...)` calls, including the Prettier-wrapped `db\n  .collection<T>(...)` form. */
export function countAccess(source: string, file: string): FileCounts {
  const counts: FileCounts = {};
  if (!/\.\s*collection\b/.test(source)) return counts;
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    false,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const getterModule = DOOR_DIRS.some((dir) => file.startsWith(dir));
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "collection" &&
      node.arguments.length > 0
    ) {
      if (!node.typeArguments?.length) counts[UNTYPED] = (counts[UNTYPED] ?? 0) + 1;
      const argument = node.arguments[0]!;
      if (
        !getterModule &&
        (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) &&
        frontDoor.has(argument.text)
      )
        counts[argument.text] = (counts[argument.text] ?? 0) + 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return counts;
}

export function scanRepo(root = process.cwd()): AccessCounts {
  const listed = execFileSync("git", ["ls-files", "-z", "src"], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter(isScannedFile);
  const out: AccessCounts = {};
  for (const file of listed) {
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const counts = countAccess(source, file);
    if (Object.keys(counts).length) out[file] = counts;
  }
  return out;
}

export interface Regression {
  file: string;
  metric: string;
  baseline: number;
  current: number;
}

/** Any count above its baseline; a file or metric missing from the baseline counts as 0. */
export function findRegressions(baseline: AccessCounts, current: AccessCounts): Regression[] {
  const out: Regression[] = [];
  for (const [file, counts] of Object.entries(current)) {
    for (const [metric, count] of Object.entries(counts)) {
      const base = baseline[file]?.[metric] ?? 0;
      if (count > base) out.push({ file, metric, baseline: base, current: count });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.metric.localeCompare(b.metric));
}

/** Lower each entry to the current count. Never raises a count or adds a file or metric. */
export function lowerBaseline(baseline: AccessCounts, current: AccessCounts): AccessCounts {
  const out: AccessCounts = {};
  for (const [file, base] of Object.entries(baseline)) {
    const next: FileCounts = {};
    for (const [metric, count] of Object.entries(base)) {
      const lowered = Math.min(count, current[file]?.[metric] ?? 0);
      if (lowered > 0) next[metric] = lowered;
    }
    if (Object.keys(next).length) out[file] = next;
  }
  return out;
}

/** Repository totals per metric, for reporting progress. */
export function totals(counts: AccessCounts): FileCounts {
  const out: FileCounts = {};
  for (const fileCounts of Object.values(counts))
    for (const [metric, count] of Object.entries(fileCounts))
      out[metric] = (out[metric] ?? 0) + count;
  return out;
}

const BASELINE_NOTE =
  "Data access ratchet. Direct .collection() calls on front-door collections outside src/lib/db/collections, and untyped .collection() calls, may only go down. Use the getter in src/lib/db/collections; after converting call sites run `npm run data-access:lower`.";

export function readBaseline(root = process.cwd()): DataAccessBaseline {
  return JSON.parse(readFileSync(join(root, BASELINE_PATH), "utf8")) as DataAccessBaseline;
}

export function writeBaseline(files: AccessCounts, root = process.cwd()): void {
  const sorted = Object.fromEntries(
    Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, counts]) => [
        file,
        Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
      ])
  );
  const body: DataAccessBaseline = { note: BASELINE_NOTE, files: sorted };
  writeFileSync(join(root, BASELINE_PATH), JSON.stringify(body, null, 2) + "\n");
}
