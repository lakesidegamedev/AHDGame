/**
 * Quebec's Layer-1 electorate model. An independent Quebec keeps Canada's
 * voter groups, bucket positions and turnout; only the census changes, to the
 * eight successor regions.
 */
import type { CountryLayer1Model } from "@/lib/seeds/international/types";
import type { EraId } from "@/lib/seeds/presetSelector";
import { getCaModel } from "../ca/layer1Model";
import { qcRegionCensusData2027 } from "./data/qcRegionCensusData2027";

/** Quebec can only exist in a 2027 world, where Canada does. */
export function getQcModel(era: EraId): CountryLayer1Model | null {
  const canada = getCaModel(era);
  if (!canada) return null;
  return {
    ...canada,
    countryId: "QC",
    census: Object.fromEntries(
      Object.entries(qcRegionCensusData2027).map(([regionId, census]) => [regionId, { ...census }])
    ),
  };
}
