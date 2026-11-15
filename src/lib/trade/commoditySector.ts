import { SECTOR_SUPPLY, type CommodityType } from "@/lib/constants/commodities";
import type { OperatingSectorType } from "@/lib/constants/corporations";

/**
 * The highest supply-rate sector for each commodity in SECTOR_SUPPLY. Maps a
 * commodity's import flow to the importer's tariff on that sector. Derived at
 * module load to stay in sync with the supply recipes.
 */
export const PRIMARY_SECTOR_BY_COMMODITY: Partial<Record<CommodityType, OperatingSectorType>> =
  (() => {
    const best: Partial<Record<CommodityType, { sector: OperatingSectorType; rate: number }>> = {};
    for (const [sector, flows] of Object.entries(SECTOR_SUPPLY) as Array<
      [OperatingSectorType, ReadonlyArray<{ commodity: CommodityType; rate: number }>]
    >) {
      for (const f of flows ?? []) {
        const cur = best[f.commodity];
        if (!cur || f.rate > cur.rate) best[f.commodity] = { sector, rate: f.rate };
      }
    }
    const out: Partial<Record<CommodityType, OperatingSectorType>> = {};
    for (const [commodity, v] of Object.entries(best) as Array<
      [CommodityType, { sector: OperatingSectorType; rate: number }]
    >) {
      out[commodity] = v.sector;
    }
    return out;
  })();
