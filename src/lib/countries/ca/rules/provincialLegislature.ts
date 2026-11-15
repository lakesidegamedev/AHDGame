import { TURNS_PER_YEAR } from "@/lib/constants/calendar";
import { CA_PROVINCIAL_LEGISLATURES } from "../data/caProvincialLegislatures";
import {
  CA_PROVINCIAL_TERM_YEARS,
  provincialElectionYearForWorld,
} from "./provincialElectionCalendar";

/** Fixed-date terms: four years between provincial general elections. */
export const CA_PROVINCIAL_PERIOD_HOURS = CA_PROVINCIAL_TERM_YEARS * TURNS_PER_YEAR;

/**
 * The turn a legislature's first election in this world ends: the last turn of
 * its next fixed-date election year, on the same scale as every other
 * end-of-year anchor (`(year - startingYear + 1) * TURNS_PER_YEAR`, shifted by
 * any completed founding phase). Undefined for a region with no legislature.
 */
export function provincialCycle1EndTurn(
  regionId: string,
  ctx: { startingYear: number; preIterationTurns?: number }
): number | undefined {
  const legislature = CA_PROVINCIAL_LEGISLATURES[regionId];
  if (!legislature) return undefined;
  return (
    (legislature.nextElectionYear - ctx.startingYear + 1) * TURNS_PER_YEAR +
    (ctx.preIterationTurns ?? 0)
  );
}

export function caProvincialElectionYearForWorld(
  region: string,
  electionType: string,
  cycle: number,
  country: string,
  preset: string | undefined
): number | undefined {
  return provincialElectionYearForWorld(
    CA_PROVINCIAL_LEGISLATURES[region]?.nextElectionYear,
    electionType,
    cycle,
    country,
    preset
  );
}

/** The first turn host opens races on turn two, leaving 22 primary turns. */
export function caOpeningProvincialPrimaryFloor(input: {
  countryId?: string;
  electionType: string;
  preset?: string;
  cycle: number;
  currentTurn: number;
  endTurn: number;
  primaryEndTurn: number;
  preIterationTurns?: number;
  minPrimaryHours: number;
}): number | undefined {
  const offset = input.preIterationTurns ?? 0;
  const openingTurn = input.currentTurn - offset;
  if (
    input.countryId !== "CA" ||
    input.electionType !== "provincialLegislature" ||
    input.preset !== "2027-default" ||
    input.cycle !== 1 ||
    input.endTurn - offset !== TURNS_PER_YEAR ||
    input.primaryEndTurn - offset !== TURNS_PER_YEAR / 2 ||
    openingTurn < 1 ||
    openingTurn > 2
  )
    return undefined;
  return Math.min(input.minPrimaryHours, input.primaryEndTurn - input.currentTurn);
}
