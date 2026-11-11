import { TURNS_PER_YEAR } from "@/lib/constants/calendar";
import { CA_PROVINCIAL_LEGISLATURES } from "../data/caProvincialLegislatures";

/** Fixed-date terms: four years between provincial general elections. */
export const CA_PROVINCIAL_PERIOD_HOURS = 4 * TURNS_PER_YEAR;

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
