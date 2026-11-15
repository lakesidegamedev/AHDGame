/**
 * Fixed cycle schedules for the 1991 successor parliaments. Plain data in,
 * plain data out: the caller supplies the preset context and anchors.
 *
 * Each entry gives the end turn of a cycle from the first election turn. A
 * null first turn means the anchor is not authored, so the race has no
 * canonical schedule.
 */
import type { CycleAnchors } from "@/lib/elections/cycleAnchorContext";

const TURNS_PER_YEAR = 48;
const FOUR_YEARS = 192;
const TWO_YEARS = 96;

export interface SuccessorScheduleContext {
  startingYear: number;
  preIterationTurns: number;
  anchors: CycleAnchors;
  customCycle1EndTurn?: number;
}

export interface SuccessorSchedule {
  countryId: string;
  electionTypes: readonly string[];
  /** First election turn, or null when the race has no schedule. */
  firstEndTurn: (ctx: SuccessorScheduleContext, electionType: string) => number | null;
  /** End turn of a 1-indexed cycle given the first election turn. */
  endTurnForCycle: (first: number, cycle: number, electionType: string) => number;
  /** Types with no race at all in presets other than 1991. */
  absentOutside1991?: readonly string[];
}

const everyFourYears = (first: number, cycle: number): number => first + (cycle - 1) * FOUR_YEARS;

export const SUCCESSOR_1991_SCHEDULES: readonly SuccessorSchedule[] = [
  {
    // Constituent chambers stood until September 1992, then four-year terms.
    countryId: "RO",
    electionTypes: ["chamberOfDeputies", "senat"],
    firstEndTurn: (c) => (1992 - c.startingYear + 1) * TURNS_PER_YEAR + c.preIterationTurns,
    endTurnForCycle: everyFourYears,
  },
  {
    // Both chambers vote together. The Sejm elected in October 1991 was
    // dissolved early; the successor was elected in September 1993. The
    // first cycle gets one bootstrap turn so the 24+24 window fits.
    countryId: "PL",
    electionTypes: ["sejm", "senat"],
    absentOutside1991: ["senat"],
    firstEndTurn: (c) => c.anchors.plSejm ?? null,
    endTurnForCycle: (first, cycle) =>
      cycle === 1 ? first + 1 : first + TWO_YEARS + (cycle - 2) * FOUR_YEARS,
  },
  {
    // The December 1994 election was early, so ordinary terms run four years.
    countryId: "BG",
    electionTypes: ["nationalAssembly"],
    firstEndTurn: (c) =>
      c.customCycle1EndTurn ?? (1991 - c.startingYear) * TURNS_PER_YEAR + 38 + c.preIterationTurns,
    endTurnForCycle: everyFourYears,
  },
  {
    countryId: "CS",
    electionTypes: ["chamberOfThePeople"],
    firstEndTurn: (c) => c.anchors.csFederalAssembly ?? null,
    endTurnForCycle: (first, cycle) => first + (cycle - 1) * TWO_YEARS,
  },
  {
    countryId: "HU",
    electionTypes: ["nationalAssembly"],
    firstEndTurn: (c) => c.anchors.huNationalAssembly ?? null,
    endTurnForCycle: everyFourYears,
  },
];

export function findSuccessorSchedule(
  countryId: string | undefined,
  electionType: string
): SuccessorSchedule | undefined {
  return SUCCESSOR_1991_SCHEDULES.find(
    (s) => s.countryId === countryId && s.electionTypes.includes(electionType)
  );
}
