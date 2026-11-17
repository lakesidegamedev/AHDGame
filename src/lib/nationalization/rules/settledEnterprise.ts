/** Funded public enterprises report settled output and profit in turn units. */
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import type { CorporateSector } from "@/lib/db/types/corporationSector";

export function isFundedHolding(
  sector: Pick<CorporateSector, "producerSettlement" | "producerInventory" | "plantsPnl">
): boolean {
  return (
    !!sector.producerInventory ||
    !!sector.producerSettlement ||
    sector.plantsPnl?.source === "funded"
  );
}

export function fundedDailyToTurn(
  sector: Parameters<typeof isFundedHolding>[0],
  daily: number
): number {
  return isFundedHolding(sector) ? daily / TURNS_PER_DAY : daily;
}

/** No settled sales means no delivered public service, even when nameplate capacity survives. */
export function publicServiceWeight(
  sector: Pick<
    CorporateSector,
    "mothballed" | "revenue" | "realizedRevenue" | "producerSettlement" | "producerInventory"
  >
): number {
  if (sector.mothballed) return 0;
  const sold =
    sector.producerSettlement?.revenue ??
    (sector.producerInventory
      ? 0
      : (sector.realizedRevenue ?? sector.revenue ?? 0) / TURNS_PER_DAY);
  return Number.isFinite(sold) ? Math.max(0, sold) : 0;
}

export function fundedSectorIncome(input: {
  currentTurn?: number | null;
  settledTurn?: number;
  profitAnchor?: number;
  dailyProfitAnchor?: number;
}): number {
  if (
    input.currentTurn != null &&
    input.settledTurn != null &&
    (input.settledTurn < input.currentTurn || input.settledTurn > input.currentTurn + 1)
  )
    return 0;
  return input.dailyProfitAnchor == null
    ? (input.profitAnchor ?? 0)
    : input.dailyProfitAnchor / TURNS_PER_DAY;
}

export function enterpriseIncomeAfterOverheads(
  income: number,
  dailyOverheads: number,
  funded: boolean
): number {
  return income - dailyOverheads / (funded ? TURNS_PER_DAY : 1);
}

type ServiceSite = Pick<
  CorporateSector,
  | "countryId"
  | "stateId"
  | "sectorType"
  | "mothballed"
  | "revenue"
  | "realizedRevenue"
  | "producerSettlement"
  | "producerInventory"
>;
const serviceBucket = (site: ServiceSite): string =>
  JSON.stringify([site.countryId, site.stateId, site.sectorType]);

export function publicServiceTotals(sites: readonly ServiceSite[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const site of sites) {
    const key = serviceBucket(site);
    totals.set(key, (totals.get(key) ?? 0) + publicServiceWeight(site));
  }
  return totals;
}

export function publicServiceShare(site: ServiceSite, totals: ReadonlyMap<string, number>): number {
  const total = totals.get(serviceBucket(site)) ?? 0;
  return total > 0 ? Math.min(1, publicServiceWeight(site) / total) : 0;
}
