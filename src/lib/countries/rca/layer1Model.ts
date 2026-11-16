/**
 * California's Layer-1 electorate model. An independent California keeps the American
 * voter groups, turnout and bucket positions, with the California position
 * overrides the US model fits for its state; only the census changes, to the
 * six successor regions.
 */
import type { CountryLayer1Model } from "@/lib/seeds/international/types";
import type { EraId } from "@/lib/seeds/presetSelector";
import { getEraComposition, getEraPositions } from "@/lib/seeds/demographicCategories";
import { usStatePositions2027 } from "../us/data/usStatePositions2027";
import { rcaRegionCensusData2027 } from "./data/rcaRegionCensusData2027";

const LAYER1_DIMS = ["race", "age", "education", "wealth", "ideology"];

/** Per-region contextual lean offsets: the coastal metros lean left, the valley and inland right. */
const REGIONAL_CONTEXT: NonNullable<CountryLayer1Model["regionalContext"]> = {
  RCA_LAX: { economicLean: -0.3, socialLean: -0.3 },
  RCA_BAY: { economicLean: -1.2, socialLean: -1.2 },
  RCA_SAN: { economicLean: 0.2, socialLean: 0.2 },
  RCA_INL: { economicLean: 0.6, socialLean: 0.6 },
  RCA_CVY: { economicLean: 1, socialLean: 1 },
  RCA_NOR: { economicLean: -0.3, socialLean: -0.3 },
};

/** California can only exist in a 2027 world, where the US model carries its electorate. */
export function getRcaModel(era: EraId): CountryLayer1Model | null {
  if (era !== "2027") return null;
  const composition = getEraComposition(era);
  const base = getEraPositions(era, "CA");
  const positions: CountryLayer1Model["positions"] = {};
  for (const dim of LAYER1_DIMS) {
    positions[dim] = { ...(base as Record<string, CountryLayer1Model["positions"][string]>)[dim] };
  }
  for (const [dim, keys] of Object.entries(usStatePositions2027.CA ?? {})) {
    positions[dim] = { ...(positions[dim] ?? {}), ...keys };
  }
  return {
    countryId: "RCA",
    categoryId: "voterGroups",
    groupIds: [...composition.groupIds],
    dims: [...LAYER1_DIMS],
    turnoutRates: composition.turnoutRates as unknown as CountryLayer1Model["turnoutRates"],
    positions,
    composition: composition.voterGroupComposition,
    defaultLeans: composition.defaultLeans,
    census: Object.fromEntries(
      Object.entries(rcaRegionCensusData2027).map(([regionId, census]) => [
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
