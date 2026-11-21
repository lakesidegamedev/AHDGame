import type { CorporationType } from "@/lib/constants/corporations";
import { seedPlantLedger, splitWholePlantCount } from "@/lib/corporations/plantLedger";
import {
  type SectorPlantFields,
  carveSectorPlantFields,
} from "@/lib/corporations/sectorTransferCapex";

/** Quote exactly the whole facilities, divisible construction and stock assigned to the buyer. */
export function fundedSiteSlice(
  sector: SectorPlantFields & {
    sectorType: CorporationType;
    constructionInProgressAnchor?: number | null;
  },
  fraction: number
) {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
    throw new Error("Invalid site fraction");
  const opening = seedPlantLedger(sector, sector.capitalStock).plantCount;
  const split = splitWholePlantCount(opening, fraction);
  return {
    acquired: {
      ...carveSectorPlantFields(sector, fraction, split.carved),
      constructionInProgressAnchor: (sector.constructionInProgressAnchor ?? 0) * fraction,
    },
    liabilityFraction: opening > 0 ? split.carved / opening : fraction,
  };
}

/** Apply the existing market cap to the actual whole-facility allocation. */
export function fundedCarveFitsMarketLimit(
  sector: Parameters<typeof fundedSiteSlice>[0],
  fraction: number,
  maxFraction: number
): boolean {
  return (
    Number.isFinite(maxFraction) &&
    fundedSiteSlice(sector, fraction).liabilityFraction <= maxFraction + 1e-6
  );
}
