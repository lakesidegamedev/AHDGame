/**
 * New England's Layer-1 electorate model. An independent New England keeps the American
 * voter groups, turnout and bucket positions, with the Massachusetts position
 * overrides the US model fits for its state; only the census changes, to the
 * six successor regions.
 */
import type { CountryLayer1Model } from "@/lib/seeds/international/types";
import type { EraId } from "@/lib/seeds/presetSelector";
import { getEraComposition, getEraPositions } from "@/lib/seeds/demographicCategories";
import { usStatePositions2027 } from "../us/data/usStatePositions2027";
import { nenRegionCensusData2027 } from "./data/nenRegionCensusData2027";

const LAYER1_DIMS = ["race", "age", "education", "wealth", "ideology"];

/** Per-region lean offsets: Vermont and Massachusetts lean furthest left, Maine and New Hampshire right. */
const REGIONAL_CONTEXT: NonNullable<CountryLayer1Model["regionalContext"]> = {
  ME: { economicLean: 0.3, socialLean: 0.1 },
  NH: { economicLean: 0.4, socialLean: 0.2 },
  VT: { economicLean: -1, socialLean: -1 },
  MA: { economicLean: -0.7, socialLean: -0.7 },
  RI: { economicLean: -0.4, socialLean: -0.4 },
  CT: { economicLean: -0.2, socialLean: -0.2 },
};

/** New England can only exist in a 2027 world, where the US model carries its electorate. */
export function getNenModel(era: EraId): CountryLayer1Model | null {
  if (era !== "2027") return null;
  const composition = getEraComposition(era);
  const base = getEraPositions(era, "MA");
  const positions: CountryLayer1Model["positions"] = {};
  for (const dim of LAYER1_DIMS) {
    positions[dim] = { ...(base as Record<string, CountryLayer1Model["positions"][string]>)[dim] };
  }
  for (const [dim, keys] of Object.entries(usStatePositions2027.MA ?? {})) {
    positions[dim] = { ...(positions[dim] ?? {}), ...keys };
  }
  return {
    countryId: "NEN",
    categoryId: "voterGroups",
    groupIds: [...composition.groupIds],
    dims: [...LAYER1_DIMS],
    turnoutRates: Object.fromEntries(Object.entries(composition.turnoutRates)),
    positions,
    composition: composition.voterGroupComposition,
    defaultLeans: composition.defaultLeans,
    census: Object.fromEntries(
      Object.entries(nenRegionCensusData2027).map(([regionId, census]) => [
        regionId,
        {
          race: { ...census.race },
          age: { ...census.age },
          education: { ...census.education },
          wealth: { ...census.wealth },
          ideology: { ...census.ideology },
        },
      ])
    ),
    regionalContext: REGIONAL_CONTEXT,
    electorateRegionalContext: true,
  };
}
