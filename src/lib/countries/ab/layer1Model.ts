/**
 * Alberta's Layer-1 electorate model. An independent Alberta keeps Canada's
 * voter groups, bucket positions and turnout; only the census changes, to the
 * eight successor regions.
 */
import type { CountryLayer1Model } from "@/lib/seeds/international/types";
import type { EraId } from "@/lib/seeds/presetSelector";
import { getCaModel } from "../ca/layer1Model";
import { abRegionCensusData2027 } from "./data/abRegionCensusData2027";

/** Alberta can only exist in a 2027 world, where Canada does. */
export function getAbModel(era: EraId): CountryLayer1Model | null {
  const canada = getCaModel(era);
  if (!canada) return null;
  return {
    ...canada,
    countryId: "AB",
    census: Object.fromEntries(
      Object.entries(abRegionCensusData2027).map(([regionId, census]) => [regionId, { ...census }])
    ),
  };
}
