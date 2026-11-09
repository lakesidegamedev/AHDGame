import type { StateDemographics } from "@/lib/db/types";
import { buildGranularElectorateSubstrate } from "@/lib/demographics/granularElectorate";
import {
  computeMedianVoter,
  computeNationalEvWeightedMedian,
  type MedianVoter,
} from "@/lib/electionEngine/medianVoter";

interface CensusMedianInput {
  countryId: string;
  preset: string | undefined;
  eraYear: { year: number | null; startingYear: number | null };
  demographics: StateDemographics[];
  defaults: StateDemographics[];
  /** Electoral votes by state id; null reads the single `stateId` race instead. */
  evByState: Record<string, number> | null;
  stateId?: string;
}

/**
 * Median voter for the persuasion card, read off the same census cells the
 * vote engine counts. A state without a census contributes nothing.
 */
export function censusMedianVoter(input: CensusMedianInput): MedianVoter | undefined {
  const defaultsByState = new Map(input.defaults.map((d) => [d._id as string, d]));
  const medianFor = (demographics: StateDemographics): MedianVoter | null => {
    const stateId = demographics._id as string;
    const substrate = buildGranularElectorateSubstrate({
      countryId: input.countryId,
      stateId,
      preset: input.preset,
      ...input.eraYear,
      statePopulation: 1,
      demographics,
      demographicDefaults: defaultsByState.get(stateId) ?? null,
      enriched: [],
    });
    return substrate ? computeMedianVoter(substrate.electorate, substrate.liveTurnouts) : null;
  };
  if (input.evByState) {
    const evByState = input.evByState;
    const entries = input.demographics.flatMap((d) => {
      const ev = evByState[d._id as string] ?? 0;
      const median = ev > 0 ? medianFor(d) : null;
      return median ? [{ median, ev }] : [];
    });
    return entries.length > 0 ? computeNationalEvWeightedMedian(entries) : undefined;
  }
  const own = input.demographics.find((d) => d._id === input.stateId);
  return own ? (medianFor(own) ?? undefined) : undefined;
}
