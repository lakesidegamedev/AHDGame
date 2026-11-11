/**
 * Build advice uses funded orders minus deliveries, scoped to the markets each
 * output can serve. fundedBuildDemand keeps missing measurements unknown.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import type {
  FundedCountryBookRow,
  FundedRegionalBookRow,
} from "@/lib/market/producerMarket/fundedBookRules";
import {
  isCountryBookCommodity,
  isStateScopedCommodity,
} from "@/lib/market/rules/commodityMarketScope";

export interface BuildDemandRow {
  commodity: CommodityType;
  scope: "regional" | "national";
  funded: number | null;
  delivered: number | null;
  unmet: number | null;
  /** New capacity after known idle output and queues, in this candidate's output mix. */
  capacityUnits?: number | null;
}

/** Actual cash-backed orders, not modelled trade or unclaimed market share.
 * National demand includes the region, so these rows must never be summed.
 * Foreign orders are deliberately not promised without buyer-route eligibility.
 */
export function fundedBuildDemand(input: {
  supply: Partial<Record<CommodityType, number>>;
  stateId: string;
  countryId: string;
  countries: readonly FundedCountryBookRow[];
  regions?: readonly FundedRegionalBookRow[];
  regionalUnitScale: number;
}): BuildDemandRow[] {
  return Object.entries(input.supply)
    .filter(([, rate]) => (rate ?? 0) > 0)
    .flatMap(([key]) => {
      const commodity = key as CommodityType;
      const regional = isStateScopedCommodity(commodity) && !isCountryBookCommodity(commodity);
      const row = regional
        ? input.regions?.find((r) => r.stateId === input.stateId && r.commodity === commodity)
        : input.countries.find((r) => r.countryId === input.countryId && r.commodity === commodity);
      const scale = regional ? input.regionalUnitScale : 1;
      const valid = (x: number | undefined): number | null =>
        typeof x === "number" && Number.isFinite(x) && x >= 0 ? x * scale : null;
      // An explicitly published empty regional book is measured zero. An older
      // receipt without the regional measurement is unknown, never a glut.
      const measuredEmpty = regional && input.regions !== undefined && !row;
      const funded = measuredEmpty ? 0 : valid(row?.funded);
      const delivered = measuredEmpty ? 0 : valid(row?.filled);
      const primary: BuildDemandRow = {
        commodity,
        scope: regional ? "regional" : "national",
        funded,
        delivered,
        unmet: funded == null || delivered == null ? null : Math.max(0, funded - delivered),
      };
      if (regional) return [primary];
      const local = input.regions?.find(
        (r) => r.stateId === input.stateId && r.commodity === commodity
      );
      const localFunded =
        input.regions === undefined ? null : valid((local?.funded ?? 0) * input.regionalUnitScale);
      const localFilled =
        input.regions === undefined ? null : valid((local?.filled ?? 0) * input.regionalUnitScale);
      // Primary national row last: keyed consumers select the full market, not its subset.
      return [
        {
          commodity,
          scope: "regional" as const,
          funded: localFunded,
          delivered: localFilled,
          unmet:
            localFunded == null || localFilled == null
              ? null
              : Math.max(0, localFunded - localFilled),
        },
        primary,
      ];
    });
}
