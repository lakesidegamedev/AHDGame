import { withSessionDb } from "@/lib/db/sessionDb";
import { transferFundedSite } from "./fundedSiteTransfer";
import { moveProducerLiabilities } from "./producerLiabilities";
import {
  prepareConstructionBorrowerTransfers,
  securedSiteMergeRefusal,
  settleConstructionBorrowerTransfers,
} from "@/lib/banking/constructionBorrowerTransfer";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import type { CorporationType } from "@/lib/constants/corporations";
import { resolveNationalCorporationForSector } from "./nationalCorporation";
import { writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";

import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getMarketSystemModeForDb, marketAtLeast } from "@/lib/market/featureFlag";
import { computeSectorImpliedUnits } from "@/lib/market/sectorImpliedUnits";
import {
  mergeSectorPlantFields,
  readSectorPlantFields,
} from "@/lib/corporations/sectorTransferCapex";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";

const DEFAULT_PROFIT_MARGIN = 20;
const DEFAULT_GROWTH_RATE = 1;

/**
 * Load FX rate for a country's currency. Used by {@link incrementNatCorpSectorRevenue}
 * to convert ₳-denominated seed revenue into the natcorp's local currency before
 * persisting — corporateSectors.revenue is stored in liquidCurrencyCode units.
 *
 * Country-scoped, not currency-scoped: post-eurozone several countries share
 * EUR, so a `{ currencyCode }` query can return another country's row (and a
 * 2027 legacy code matches no row at all, silently falling back to rate 1).
 * The seeded row carries `countryId`, which is unique per country.
 */
async function loadFxRateForCountry(
  db: Db,
  countryId: CountryId
): Promise<{ code: CurrencyCode | undefined; rate: number }> {
  const direct = await exchangeRatesCollection(db).findOne({ countryId });
  if (direct && direct.rate > 0) {
    return { code: direct.currencyCode, rate: direct.rate };
  }
  const code = COUNTRY_CURRENCY_MAP[countryId];
  if (!code) return { code: undefined, rate: 1 };
  const doc = await exchangeRatesCollection(db).findOne({ currencyCode: code });
  return { code, rate: doc?.rate && doc.rate > 0 ? doc.rate : 1 };
}

/**
 * Add revenue directly to a National Corporation sector (admin seed / heal path).
 * No nationalization haircut — this is fresh capacity, not a disrupted transfer.
 */
export async function incrementNatCorpSectorRevenue(
  db: Db,
  params: {
    countryId: CountryId;
    stateId: string;
    sectorType: CorporationType;
    revenueDelta: number;
  }
): Promise<"inc" | "insert" | "noop"> {
  const revenueDeltaAnchor = Math.round(params.revenueDelta);
  if (revenueDeltaAnchor <= 0) return "noop";

  const now = new Date();
  const corp = await resolveNationalCorporationForSector(db, params.countryId, params.sectorType);

  // Convert ₳-denominated seed revenue into the natcorp's local currency before
  // persisting. corporateSectors.revenue is stored in liquidCurrencyCode units;
  // the commodity turn reads it back via readCorpEconomicAnchor (local → ₳).
  // Without this conversion, a ₳ amount stored into a GBP corp gets divided by
  // the GBP FX rate again on read, double-converting and inflating by ~1.5x.
  const { code, rate } = await loadFxRateForCountry(db, params.countryId);
  const corpCode = resolveCorpLiquidCurrencyCode(corp) ?? code;
  const corpRate = corpCode === code ? rate : 1;
  const revenueDeltaLocal = Math.round(
    writeCorpEconomicLocal(revenueDeltaAnchor, corpCode, corpRate)
  );

  // PLANTS LOCKSTEP. Under `marketSystemMode >= "plants"` a corporate sector's
  // `revenue` is DERIVED — `sectorTurn` restates it from `capitalStock × mix
  // price` every turn — so a revenue-only seed is erased on the next tick and
  // the natcorp receives nothing. The quantity therefore has to land on
  // capacity. `computeSectorImpliedUnits` is the same ₳ → units conversion the
  // engine's `impliedOutputUnits` uses, so
  // the units are commensurable with `capitalStock`. It takes ₳, NOT the
  // local-currency figure — `capitalStock` is currency-free.
  //
  // Revenue is still written, in LOCKSTEP and off the same quantity: units
  // lead, revenue is the derived restatement of those same units, so the two
  // legs cannot diverge and the first turn's figure matches what `sectorTurn`
  // recomputes. `plantsStartTurn` is deliberately left unset — `sectorTurn`
  // stamps it on the sector's first plants turn, which starts the launch
  // governor's ramp for genuinely new capacity.
  //
  // Below plants `capacityUnitsDelta` is 0 and every write here is byte
  // identical to the pre-P3b behaviour.
  // PLANTS-GATED: under plants the seed grants `capitalStock` units converted from
  // the same ₳ figure as the revenue leg, so units lead and revenue is the derived
  // restatement of that same quantity. Below plants the capacity delta is 0 and
  // every write is byte-identical to the pre-P3b behaviour.
  const plantsEnabled = marketAtLeast(await getMarketSystemModeForDb(db), "plants");
  // Dynamic import: budgets.ts reaches this module through the seed path,
  // and a static gdpAnchorRate import would close the same init cycle
  // publicEnterpriseRevenue documents (gdpAnchorRate → countryReadinessContract
  // → budgets → … → here).
  const capacityUnitsDelta = plantsEnabled
    ? computeSectorImpliedUnits(
        params.sectorType,
        revenueDeltaAnchor,
        null,
        await (await import("@/lib/currency/gdpAnchorRate")).loadWorldEraUnitScale(db)
      )
    : 0;

  const sectors = corporateSectorsCollection(db);
  const existing = await sectors.findOne({
    corporationId: corp._id,
    stateId: params.stateId,
    sectorType: params.sectorType,
  });

  if (existing) {
    await sectors.updateOne(
      { _id: existing._id },
      {
        $inc: {
          revenue: revenueDeltaLocal,
          ...(capacityUnitsDelta > 0 ? { capitalStock: capacityUnitsDelta } : {}),
        },
        $set: {
          ...(capacityUnitsDelta > 0
            ? seedPlantLedger(
                { ...params, strategyId: existing.strategyId },
                (existing.capitalStock ?? 0) + capacityUnitsDelta
              )
            : {}),
          updatedAt: now,
        },
      }
    );
    return "inc";
  }

  await sectors.insertOne({
    _id: new ObjectId(),
    corporationId: corp._id,
    countryId: params.countryId,
    stateId: params.stateId,
    sectorType: params.sectorType,
    revenue: revenueDeltaLocal,
    ...(capacityUnitsDelta > 0 ? { capitalStock: capacityUnitsDelta } : {}),
    ...(capacityUnitsDelta > 0 ? seedPlantLedger(params, capacityUnitsDelta) : {}),
    workers: 0,
    profitMargin: DEFAULT_PROFIT_MARGIN,
    targetGrowthRate: DEFAULT_GROWTH_RATE,
    currentGrowthRate: DEFAULT_GROWTH_RATE,
    currentGrowthCost: 0,
    createdAt: now,
    updatedAt: now,
  } as CorporateSector);
  return "insert";
}

export type OwnedSectorMergeInput = Pick<
  CorporateSector,
  | "_id"
  | "stateId"
  | "sectorType"
  | "countryId"
  | "revenue"
  | "workers"
  | "currentGrowthCost"
  | "corporationId"
>;

/**
 * Fold a private/NPC sector into the National Corporation (admin heal path).
 * Full revenue is transferred with no nationalization haircut or compensation.
 */
export async function absorbOwnedSectorIntoNatCorp(
  db: Db,
  sector: OwnedSectorMergeInput,
  opts?: { dryRun?: boolean }
): Promise<number> {
  if (opts?.dryRun) {
    const source = await corporateSectorsCollection(db).findOne({ _id: sector._id });
    return Math.max(0, Math.round(source?.revenue ?? 0));
  }
  return withSessionDb(db, async (db) => {
    const sectors = corporateSectorsCollection(db);
    const source = await sectors.findOne({ _id: sector._id, corporationId: sector.corporationId });
    if (!source) return 0;
    const corp = await resolveNationalCorporationForSector(
      db,
      source.countryId,
      source.sectorType as CorporationType
    );
    if (source.corporationId.equals(corp._id)) return 0;
    const existing = await sectors.findOne({
      corporationId: corp._id,
      stateId: source.stateId,
      sectorType: source.sectorType,
    });
    if (!source.producerInventory) {
      const refusal = await securedSiteMergeRefusal(db, [source], corp._id);
      if (refusal) throw new Error(refusal);
    }
    const now = new Date(),
      key = `captured-heal:${source._id.toHexString()}:${corp._id.toHexString()}`;
    const prepared = await prepareConstructionBorrowerTransfers(db, {
      sectors: [source],
      toId: corp._id,
      toCurrency: resolveCorpLiquidCurrencyCode(corp),
      operationKey: key,
    });
    if (!prepared.ok) throw new Error(prepared.error);
    let resultingId = source._id;
    if (source.producerInventory) {
      resultingId = await transferFundedSite(db, {
        source,
        toId: corp._id,
        fraction: 1,
        key,
        acquired: { ...prepared.plan.setFor(source._id), updatedAt: now },
      });
    } else if (existing && !existing._id.equals(source._id)) {
      const merged = mergeSectorPlantFields(
        readSectorPlantFields(existing),
        readSectorPlantFields(source)
      );
      const written = await sectors.updateOne(
        { _id: existing._id, corporationId: corp._id },
        {
          $inc: {
            revenue: source.revenue ?? 0,
            workers: source.workers ?? 0,
            currentGrowthCost: source.currentGrowthCost ?? 0,
          },
          $set: { ...merged, updatedAt: now },
        }
      );
      if (written.matchedCount !== 1) throw new Error("Captured-market receiver changed");
      const deleted = await sectors.deleteOne({
        _id: source._id,
        corporationId: source.corporationId,
      });
      if (deleted.deletedCount !== 1) throw new Error("Captured-market donor changed");
      resultingId = existing._id;
      await moveProducerLiabilities(db, {
        fromId: source.corporationId,
        toId: corp._id,
        sites: new Map([
          [source._id.toHexString(), { producerId: resultingId.toHexString(), fraction: 1 }],
        ]),
      });
    } else {
      const moved = await sectors.updateOne(
        { _id: source._id, corporationId: source.corporationId },
        {
          $set: { corporationId: corp._id, ...prepared.plan.setFor(source._id), updatedAt: now },
        }
      );
      if (moved.matchedCount !== 1) throw new Error("Captured-market site changed");
      await moveProducerLiabilities(db, {
        fromId: source.corporationId,
        toId: corp._id,
        sites: new Map([
          [source._id.toHexString(), { producerId: resultingId.toHexString(), fraction: 1 }],
        ]),
      });
    }
    await settleConstructionBorrowerTransfers(db, prepared.plan);
    return Math.max(0, Math.round(source.revenue ?? 0));
  });
}
