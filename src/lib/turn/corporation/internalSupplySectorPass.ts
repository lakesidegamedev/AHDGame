/**
 * Finalize internal input discounts after actual plant consumption is known,
 * before corporation income, taxes and dividends. Each sector runs once.
 */
import { processSector, type SectorTurnEnv, type SectorTurnResult } from "./sectorTurn";
import {
  fxRateForSectorHostFromMap,
  resolveSectorHostCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { settleConsumedInternalDiscounts } from "@/lib/market/internalSupply/rules";
import { settleGroupDiscounts } from "@/lib/corporations/groups/rules/discounts";
import { TURNS_PER_DAY } from "@/lib/constants/turnTime";
import type { CommodityType } from "@/lib/constants/commodities";

/** Shared empty maps: most sectors consume no internal supply and no group output. */
const NO_INPUT_UNITS: ReadonlyMap<CommodityType, number> = new Map();
const NO_OUTPUT_UNITS: ReadonlyMap<string, number> = new Map();

export function prepareInternalSupplySectorResults(
  env: SectorTurnEnv
): Map<string, SectorTurnResult> | undefined {
  const groupReceipts = env.market.groupSupplyReceipts ?? [];
  if (!env.market.internalSupplyTrades?.length && !groupReceipts.some((r) => (r.discount ?? 0) > 0))
    return undefined;
  const results = new Map<string, SectorTurnResult>();
  // The pre-pass is DB-free. Cache results, including their update collectors;
  // the normal corporation loop consumes them instead of running sectors again.
  env.market.internalSupplyDiscountCostBySectorId = undefined;
  for (const corp of env.lookups.corporations) {
    const sectors = env.lookups.sectorsByCorp.get(corp._id.toString()) ?? [];
    for (const sector of sectors)
      results.set(
        sector._id.toString(),
        processSector(
          env,
          corp,
          sector,
          sectors.length,
          resolveSectorHostCurrencyCode(sector, corp),
          fxRateForSectorHostFromMap(sector, corp, env.lookups.exchangeRatesByCurrency)
        )
      );
  }
  // Both settlement passes look sectors up by the ids their trades and receipts
  // name, so only those ids need a row. Building the full map allocated one
  // entry per sector in the world for a handful of consumers.
  const trades = env.market.internalSupplyTrades ?? [];
  const consumption = new Map<string, ReadonlyMap<CommodityType, number>>();
  const groupOutputs = new Map<string, ReadonlyMap<string, number>>();
  const consumptionFor = (id: string) => {
    if (!consumption.has(id))
      consumption.set(id, results.get(id)?.internalSupplyInputUnits ?? NO_INPUT_UNITS);
  };
  const outputFor = (id: string) => {
    if (!groupOutputs.has(id))
      groupOutputs.set(id, results.get(id)?.groupSupplyOutputUnits ?? NO_OUTPUT_UNITS);
  };
  for (const trade of trades) consumptionFor(trade.buyerSectorId);
  for (const receipt of groupReceipts) {
    consumptionFor(receipt.buyerSectorId);
    outputFor(receipt.supplierSectorId);
  }
  const costs = settleConsumedInternalDiscounts(
    trades,
    consumption,
    TURNS_PER_DAY,
    env.market.internalSupplyCommittedInputsBySectorId
  );
  for (const [id, cost] of settleGroupDiscounts(
    groupReceipts,
    consumption,
    env.market.groupSupplyCommittedInputsBySector,
    groupOutputs,
    env.market.groupSupplyCommittedOutputsBySector
  ))
    costs.set(id, (costs.get(id) ?? 0) + cost);
  env.market.internalSupplyDiscountCostBySectorId = costs;
  for (const [id, cost] of costs)
    if (cost !== 0) results.get(id)?.applyInternalSupplyDiscount?.(cost);
  return results;
}
