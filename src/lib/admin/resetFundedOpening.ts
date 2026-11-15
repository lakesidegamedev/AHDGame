/**
 * Opens a freshly reset world directly on the funded producer market.
 *
 * Before this step, a fresh world ran one legacy turn first, because the
 * opening census needs two values that only a turn produced: physical capacity
 * on sectors seeded without `capitalStock`, and per-state prices for
 * state-scoped commodities. This fills both the way the first turn would, then
 * runs the census, the opening apply and the funded switch. The first turn
 * the operator starts is the first funded turn.
 *
 * Creates no money: capacity and prices are not cash, and the opening apply
 * refuses any plan that creates cash or input stock.
 */
import type { AnyBulkWriteOperation, Db, Document } from "mongodb";
import { isOperatingSectorType } from "@/lib/constants/corporationsClient";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";
import { resolveSectorHostCurrencyCode } from "@/lib/currency/corporationCapital";
import { loadWorldPreset } from "@/lib/currency/gdpAnchorRate";
import { commodityPricesCollection } from "@/lib/db/repositories/commodityPrices";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { computeSectorImpliedUnits } from "@/lib/market/sectorImpliedUnits";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { captureProducerOpening } from "@/lib/market/producerMarket/openingCapture";
import { applyProducerOpening } from "@/lib/market/producerMarket/openingApply";
import { applyFundedSwitch } from "@/lib/admin/economyReset/fundedSwitch";

export interface ResetFundedOpeningResult {
  capacityFilled: number;
  statePricesFilled: number;
  openingSectors: number;
  producerMarketLiveFromTurn: number;
}

/**
 * Capacity for a sector that has never been through a turn: the units its
 * revenue base implies, with revenue converted from the host currency to the
 * anchor. Same formula as the first plants turn's flip
 * (`capacity := impliedOutputUnits(nameplate)`), so a filled sector opens where
 * a legacy turn would have put it.
 */
export function openingCapacityUnits(input: {
  sectorType: string;
  revenueLocal: number;
  localPerAnchor: number;
  strategyId: string | null | undefined;
  eraUnitScale: number;
}): number | null {
  if (!isOperatingSectorType(input.sectorType)) return null;
  if (!(Number.isFinite(input.revenueLocal) && input.revenueLocal >= 0)) return null;
  const rate =
    Number.isFinite(input.localPerAnchor) && input.localPerAnchor > 0 ? input.localPerAnchor : 1;
  const units = computeSectorImpliedUnits(
    input.sectorType,
    input.revenueLocal / rate,
    input.strategyId,
    input.eraUnitScale
  );
  return Number.isFinite(units) && units >= 0 ? units : null;
}

/** Every missing state price for a state-scoped commodity, at its global price. */
export function missingStatePrices(
  doc: { commodity: string; globalPrice?: number; statePrices?: Record<string, number> },
  stateIds: readonly string[]
): Record<string, number> {
  if (!isStateScopedCommodity(doc.commodity as never)) return {};
  const price = doc.globalPrice;
  if (!(typeof price === "number" && Number.isFinite(price) && price > 0)) return {};
  const out: Record<string, number> = {};
  for (const stateId of stateIds) {
    const existing = doc.statePrices?.[stateId];
    if (!(typeof existing === "number" && Number.isFinite(existing) && existing > 0))
      out[`statePrices.${stateId}`] = price;
  }
  return out;
}

async function fillOpeningGaps(db: Db) {
  const preset = await loadWorldPreset(db);
  const eraUnitScale = getEraUnitScale(preset);
  const rates = new Map(
    (
      await exchangeRatesCollection(db)
        .find({}, { projection: { currencyCode: 1, rate: 1 } })
        .toArray()
    ).map((row) => [String(row.currencyCode), Number(row.rate)])
  );

  const sectors = await corporateSectorsCollection<Document>(db)
    .find(
      { $or: [{ capitalStock: { $exists: false } }, { capitalStock: null }] },
      { projection: { corporationId: 1, countryId: 1, sectorType: 1, revenue: 1, strategyId: 1 } }
    )
    .toArray();
  const corpIds = [...new Set(sectors.map((s) => s.corporationId))];
  const corps = new Map(
    (
      await corporationsCollection<Document>(db)
        .find({ _id: { $in: corpIds } }, { projection: { countryId: 1, liquidCurrencyCode: 1 } })
        .toArray()
    ).map((corp) => [String(corp._id), corp])
  );
  const sectorOps: AnyBulkWriteOperation<Document>[] = [];
  for (const sector of sectors) {
    const corp = corps.get(String(sector.corporationId));
    const code = resolveSectorHostCurrencyCode(sector, corp as never);
    const units = openingCapacityUnits({
      sectorType: sector.sectorType,
      revenueLocal: Number(sector.revenue ?? 0),
      localPerAnchor: code ? (rates.get(code) ?? 1) : 1,
      strategyId: sector.strategyId,
      eraUnitScale,
    });
    if (units === null) continue;
    sectorOps.push({
      updateOne: {
        filter: { _id: sector._id, capitalStock: { $in: [null] } },
        update: { $set: { capitalStock: units } },
      },
    });
  }
  if (sectorOps.length > 0)
    await corporateSectorsCollection<Document>(db).bulkWrite(sectorOps, { ordered: false });

  const stateIds = (
    await statesCollection<Document>(db)
      .find({}, { projection: { _id: 0, id: 1 } })
      .toArray()
  )
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const priceDocs = await commodityPricesCollection<Document>(db)
    .find({}, { projection: { commodity: 1, globalPrice: 1, statePrices: 1 } })
    .toArray();
  const priceOps: AnyBulkWriteOperation<Document>[] = [];
  let statePricesFilled = 0;
  for (const doc of priceDocs) {
    const set = missingStatePrices(doc as never, stateIds);
    const n = Object.keys(set).length;
    if (n === 0) continue;
    statePricesFilled += n;
    priceOps.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
  }
  if (priceOps.length > 0)
    await commodityPricesCollection<Document>(db).bulkWrite(priceOps, { ordered: false });

  return { capacityFilled: sectorOps.length, statePricesFilled };
}

/**
 * Fill the opening gaps, then capture, apply and switch. Throws with the census
 * blockers when the world still cannot open funded; the caller keeps turns
 * stopped in that case.
 */
export async function openResetWorldFunded(
  db: Db,
  options: { approvalReference: string }
): Promise<ResetFundedOpeningResult> {
  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { worldEpochId: 1 } }
  );
  const epoch = state?.worldEpochId ? String(state.worldEpochId) : "";
  if (!epoch) throw new Error("The reset world has no epoch");

  const gaps = await fillOpeningGaps(db);
  const census = await captureProducerOpening(db, {
    expectedWorldEpoch: epoch,
    approvalReference: options.approvalReference,
    requireActive: false,
  });
  if (!census.plan || !census.planDigest) {
    const blockers = census.result.blockers ?? [];
    throw new Error(
      `Funded opening blocked (${blockers.length}): ${blockers.slice(0, 5).join(", ")}`
    );
  }
  await applyProducerOpening(db, {
    plan: census.plan,
    planDigest: census.planDigest,
    approvedDigest: census.planDigest,
  });
  const switched = await applyFundedSwitch(db, { expectedWorldEpoch: epoch });
  return {
    ...gaps,
    openingSectors: census.plan.sectors.length,
    producerMarketLiveFromTurn: switched.producerMarketLiveFromTurn,
  };
}
