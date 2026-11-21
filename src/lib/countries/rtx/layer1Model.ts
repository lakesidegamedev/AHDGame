/**
 * Texas's Layer-1 electorate model. An independent Texas keeps the American
 * voter groups, turnout and bucket positions, with the Texas position
 * overrides the US model fits for its state; only the census changes, to the
 * six successor regions.
 */
import type { CountryLayer1Model } from "@/lib/seeds/international/types";
import type { EraId } from "@/lib/seeds/presetSelector";
import { getEraComposition, getEraPositions } from "@/lib/seeds/demographicCategories";
import { usStatePositions2027 } from "../us/data/usStatePositions2027";
import { rtxRegionCensusData2027 } from "./data/rtxRegionCensusData2027";

const LAYER1_DIMS = ["race", "age", "education", "wealth", "ideology"];

/** Per-region contextual lean offsets: the big metros lean left, the rural regions right. */
const REGIONAL_CONTEXT: NonNullable<CountryLayer1Model["regionalContext"]> = {
  RTX_DFW: { economicLean: -0.2, socialLean: -0.2 },
  RTX_HOU: { economicLean: -0.3, socialLean: -0.3 },
  RTX_CEN: { economicLean: -0.9, socialLean: -0.9 },
  RTX_SOU: { economicLean: -0.4, socialLean: 0 },
  RTX_WES: { economicLean: 0.5, socialLean: 0.5 },
  RTX_EAS: { economicLean: 0.9, socialLean: 0.9 },
};

/** Texas can only exist in a 2027 world, where the US model carries its electorate. */
export function getRtxModel(era: EraId): CountryLayer1Model | null {
  if (era !== "2027") return null;
  const composition = getEraComposition(era);
  const base = getEraPositions(era, "TX");
  const positions: CountryLayer1Model["positions"] = {};
  for (const dim of LAYER1_DIMS) {
    positions[dim] = { ...(base as Record<string, CountryLayer1Model["positions"][string]>)[dim] };
  }
  for (const [dim, keys] of Object.entries(usStatePositions2027.TX ?? {})) {
    positions[dim] = { ...(positions[dim] ?? {}), ...keys };
  }
  return {
    countryId: "RTX",
    categoryId: "voterGroups",
    groupIds: [...composition.groupIds],
    dims: [...LAYER1_DIMS],
    turnoutRates: Object.fromEntries(Object.entries(composition.turnoutRates)),
    positions,
    composition: composition.voterGroupComposition,
    defaultLeans: composition.defaultLeans,
    census: Object.fromEntries(
      Object.entries(rtxRegionCensusData2027).map(([regionId, census]) => [
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
