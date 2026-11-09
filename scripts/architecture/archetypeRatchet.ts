/**
 * The word "archetype" in src may only shrink, except for the concepts that
 * are not voter groups. Voters are described by census buckets (`dim:bucket`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ArchetypeCounts = Record<string, number>;

export interface ArchetypeBaseline {
  note: string;
  files: ArchetypeCounts;
}

export const BASELINE_PATH = join("scripts", "architecture", "archetypeRatchet.baseline.json");
const SCANNED_EXT = /\.(?:[cm]?tsx?|json|mdx?)$/;

/**
 * Concepts that keep the word. Each entry is a path pattern for one concept;
 * a file outside every pattern is a voter-group file and may not gain a hit.
 */
export const ALLOWED_CONCEPTS: ReadonlyArray<{ concept: string; paths: RegExp }> = [
  {
    concept: "estate",
    paths:
      /(?:cabinetEstates|\/cabinet\/rules\/estates|estateEffects|\/estates?\/|EstatesRosterTab|seedCabinetEstates)/,
  },
  {
    concept: "infra",
    paths:
      /(?:cabinetInfra|\/cabinet\/rules\/infra|infraEffects|seedInfraProjects|\/infra\/StartProjectPanel)/,
  },
  {
    concept: "military",
    paths:
      /(?:\/military\/|\/navair\/|constants\/military|seedMilitaryUnits|ordersOfBattle|OrderOfBattle|stateArmsTurn|defenceRefitTurn|navalRepairTurn|wiki\/charts\/military|conflictRecordView|\/military\/(?:UnitCard|ArsenalTab|RecruitPanel)|UnitDossier|cabinet\/\[positionId\]\/military)/,
  },
  {
    concept: "ceo",
    paths:
      /(?:ceoArchetype|nppCorporat|\/turn\/npp\/(?:corp|makeCorp|nppCorp|nppCash|nppShortage|nppTech|nppThrottled|autopilot|decisionSnapshot|extraction|frontier|operatorPolicy|reinvestment|rules\/productFill|strategyCadence|__fixtures__|context|billSponsorship|electionEntry)|nppSurplusActions|nppInvest|\/indexFunds\/|\/corporations\/|\/turn\/corporation\/|npp\/actionAi|corpStrategy)/,
  },
  { concept: "career", paths: /(?:careerArchetype|nppIdiosyncrasy|formNppCabinet)/ },
  {
    concept: "governing",
    paths:
      /(?:governingArchetype|governingAgenda|ministerialGovernance|fiscalStance|\/nppAutonomy\/|\/economicModels\/|constants\/economicModels)/,
  },
];

export function isAllowedConcept(file: string): boolean {
  return ALLOWED_CONCEPTS.some((c) => c.paths.test(file));
}

export function isScannedFile(file: string): boolean {
  return SCANNED_EXT.test(file) && !isAllowedConcept(file);
}

export function countArchetypes(source: string): number {
  return source.match(/archetype/gi)?.length ?? 0;
}

export function scanRepo(root = process.cwd()): ArchetypeCounts {
  const listed = execFileSync("git", ["ls-files", "-z", "src"], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter(isScannedFile);
  const out: ArchetypeCounts = {};
  for (const file of listed) {
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const count = countArchetypes(source);
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
export function findRegressions(baseline: ArchetypeCounts, current: ArchetypeCounts): Regression[] {
  const out: Regression[] = [];
  for (const [file, count] of Object.entries(current)) {
    const base = baseline[file] ?? 0;
    if (count > base) out.push({ file, baseline: base, current: count });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** Lower each entry to the current count. Never raises a count or adds a file. */
export function lowerBaseline(
  baseline: ArchetypeCounts,
  current: ArchetypeCounts
): ArchetypeCounts {
  const out: ArchetypeCounts = {};
  for (const [file, base] of Object.entries(baseline)) {
    const lowered = Math.min(base, current[file] ?? 0);
    if (lowered > 0) out[file] = lowered;
  }
  return out;
}

export function total(counts: ArchetypeCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

const BASELINE_NOTE =
  "Archetype ratchet. The word archetype in src may only go down per file, except for estate, infra, military, ceo, career and governing archetypes (see ALLOWED_CONCEPTS). Describe voters with census buckets (`dim:bucket`); after removing hits run `npm run archetypes:lower`.";

export function readBaseline(root = process.cwd()): ArchetypeBaseline {
  return JSON.parse(readFileSync(join(root, BASELINE_PATH), "utf8")) as ArchetypeBaseline;
}

export function writeBaseline(files: ArchetypeCounts, root = process.cwd()): void {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const body: ArchetypeBaseline = { note: BASELINE_NOTE, files: sorted };
  writeFileSync(join(root, BASELINE_PATH), JSON.stringify(body, null, 2) + "\n");
}
