import { electorateMeanLean } from "@/lib/demographics/electorateLean";
import {
  deriveCountryGroupLean,
  deriveCountryGroupPopulations,
  deriveCountryGroupTurnout,
} from "./derive";
import type { CountryLayer1Model } from "./types";

/** A region's lean as the model's composition tables give it, for era-anchor checks. */
export function modelRegionLean(
  model: CountryLayer1Model,
  region: string
): { economicLean: number; socialLean: number } {
  const census = model.census[region];
  if (!census) throw new Error(`No census for region ${region}`);
  const pops = deriveCountryGroupPopulations(model, census);
  return electorateMeanLean(
    model.groupIds.map((gid) => {
      const lean = deriveCountryGroupLean(model, gid, census);
      return {
        populationPct: pops[gid] ?? 0,
        economicLean: lean.economicLean,
        socialLean: lean.socialLean,
        turnout: deriveCountryGroupTurnout(model, gid),
      };
    })
  );
}
