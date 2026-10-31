import { createHash } from "crypto";
import { ObjectId, type Db } from "mongodb";
import type { CorporateSector, Corporation, SectorBuildOrder } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
import { capacityPricePerUnit } from "@/lib/constants/capacityEconomy";
import {
  queueUndeliveredCost,
  undeliveredCost,
  undeliveredUnits,
} from "@/lib/corporations/buildDelivery";
import {
  convertQueueToWholePlants,
  convertSectorToWholePlants,
  isWholePlantStock,
} from "@/lib/corporations/wholePlants/rules";
import { buildCapexTxEntry } from "@/lib/corporations/capexTxLog";
import { resolveWorldYear } from "@/lib/corporations/capacityCapture";
import { emitTx, loadTxThresholds } from "@/lib/financialTxLog/emit";
import {
  anchorToCorpLiquidCapital,
  fxRateForCorpFromMap,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { resolvePresetIdFromGameState } from "@/lib/world/countryReadinessContract";
import type {
  Defect,
  DetectResult,
  HealContext,
  HealPlan,
  HealResult,
  VerifyResult,
} from "../types";

/**
 * Whole plants conversion (one time, between turns, before
 * `gameConfig.wholePlantsStage` is switched on).
 *
 * Every sector is recounted to whole plants of `plantSizeForSector(sector)`:
 *
 *   - the part-plant left over is credited to the owner as money at the
 *     sector's book cost per unit (`capacityBookAnchor / capitalStock`, list
 *     price when no basis is recorded), and the basis drops by the same amount;
 *   - a sector holding less than one plant rounds UP to one plant at no charge;
 *   - the sector's in-flight cash orders are pooled and recounted to whole
 *     plants of the sector (`convertQueueToWholePlants`): plant k lands with
 *     the order at which the running total first reaches k plants, remaining
 *     plants ramp from now to each order's unchanged online turn, and the
 *     part-plant left over is refunded at the pool's paid cost per unit. An
 *     order that ends up with no plant is cancelled. A sector that owns no
 *     plant and whose orders add up to less than one gets one plant at no
 *     extra charge. AI-owned sectors (any CEO that is not a character: NPP,
 *     imperial or state) round the pool to the NEAREST plant instead: half a
 *     plant or more rounds up at no charge, less is refunded. Player orders
 *     keep the floor and refund. Financed orders (construction loan or claim) are left
 *     untouched and counted: their bank settlement is a separate step;
 *   - `plantWearUnits` and `plantUnitRemainder` start at 0.
 *
 * MONEY. This heal mints money on purpose: the part-plants are bought back.
 * Each sector's credit is one `corp_capacity_build_refund` tx row
 * (`meta.wholePlantConversion`), the same leg a cancelled build uses, so the
 * shadow ledger and money reconciler attribute it.
 *
 * IDEMPOTENCY. Three atomic steps, each guarded so a rerun is a no-op:
 *   1. the sector write is a compare-and-swap on the stock and queue it was
 *      planned from, and stamps `wholePlantsConversion.turn`;
 *   2. the owner credit is an `$inc` under a filter requiring the per-sector
 *      key `remediation.AHD-whole-plants-conversion.<sectorId>_<turn>` to be
 *      absent, set in the same update;
 *   3. the tx row has an `_id` derived from that key, so a re-emit is a
 *      duplicate and is skipped.
 * A crash between steps leaves state the detector counts and the next apply
 * finishes.
 *
 * ROLLBACK. The runner snapshots every planned sector and owner before the
 * first write. Restore with the CLI rollback, then delete the tx rows with
 * `meta.wholePlantConversion: true` and the run's `meta.conversionTurn`.
 */

export const DEFECT_ID = "AHD-whole-plants-conversion";
const SECTOR_MARKER = "wholePlantsConversion";
const CORP_MARKER = `remediation.${DEFECT_ID}`;
const BATCH = 25;

type SectorRow = Pick<
  CorporateSector,
  | "_id"
  | "corporationId"
  | "countryId"
  | "stateId"
  | "sectorType"
  | "industryModel"
  | "mediaDiscriminator"
  | "strategyId"
  | "capitalStock"
  | "capacityBookAnchor"
  | "buildQueue"
  | "constructionInProgressAnchor"
> & { [SECTOR_MARKER]?: { turn?: number } };

type CorpRow = Pick<
  Corporation,
  | "_id"
  | "name"
  | "sequentialId"
  | "ceoType"
  | "countryId"
  | "countryOwnerId"
  | "liquidCurrencyCode"
>;

export type Cohort = "player" | "npp" | "state";

export interface SectorConversion {
  sectorId: string;
  corporationId: string;
  countryId: string;
  sectorType: string;
  cohort: Cohort;
  /** Owner is not a character: in-flight orders round to the nearest plant. */
  aiOwned: boolean;
  size: number;
  /** CAS: the stock and queue this was planned from. */
  priorStock: number | null;
  priorQueue: SectorBuildOrder[] | null;
  set: Record<string, unknown>;
  stockCreditAnchor: number;
  orderRefundAnchor: number;
  creditAnchor: number;
  remainderUnits: number;
  plantsBefore: number;
  plantsAfter: number;
  roundedUp: boolean;
  ordersRewritten: number;
  ordersCancelled: number;
  starterRoundedUp: number;
  financedOrdersKept: number;
  /** Capacity units the order recount adds at no charge. */
  orderFreeUnits: number;
}

function isFinanced(order: SectorBuildOrder): boolean {
  return Boolean(order.constructionLoanId || order.constructionClaimId);
}

function cohortOf(corp: CorpRow | undefined): Cohort {
  if (!corp) return "player";
  if (corp.countryOwnerId) return "state";
  return corp.ceoType === "npp" ? "npp" : "player";
}

/** Not a character-run corporation. An unknown owner is treated as a player. */
function isAiOwned(corp: CorpRow | undefined): boolean {
  if (!corp) return false;
  return Boolean(corp.countryOwnerId) || corp.ceoType !== "character";
}

/** Does this sector still need recounting at `turn`? */
export function needsConversion(sector: SectorRow, turn: number): boolean {
  if ((sector[SECTOR_MARKER]?.turn ?? -1) >= turn) return false;
  const size = plantSizeForSector(sector);
  const stock = typeof sector.capitalStock === "number" ? sector.capitalStock : 0;
  if (stock > 0 && !isWholePlantStock(stock, size)) return true;
  return (sector.buildQueue ?? []).some(
    (order) =>
      !isFinanced(order) &&
      !(order.plantUnits && order.plantUnits > 0) &&
      undeliveredUnits(order, turn) > 1e-9
  );
}

/** Recount one sector. Plain data in, plain data out. */
export function convertSector(
  sector: SectorRow,
  input: { turn: number; listPricePerUnitAnchor: number; cohort: Cohort; aiOwned?: boolean }
): SectorConversion {
  const aiOwned = input.aiOwned ?? input.cohort !== "player";
  const { turn } = input;
  const size = plantSizeForSector(sector);
  const stock =
    typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)
      ? Math.max(0, sector.capitalStock)
      : 0;
  const stockResult = convertSectorToWholePlants({
    capitalStock: stock,
    capacityBookAnchor: sector.capacityBookAnchor,
    listPricePerUnitAnchor: input.listPricePerUnitAnchor,
    size,
  });

  // Open cash orders not yet in whole plants are pooled and recounted
  // together; financed, stamped and already-delivered orders stay as they are.
  const original = sector.buildQueue ?? [];
  const open = original.filter(
    (order) =>
      !isFinanced(order) &&
      !(order.plantUnits && order.plantUnits > 0) &&
      undeliveredUnits(order, turn) > 1e-9
  );
  const financedOrdersKept = original.filter(isFinanced).length;
  const recount = convertQueueToWholePlants(
    open.map((order) => ({
      undeliveredUnits: undeliveredUnits(order, turn),
      undeliveredCost: undeliveredCost(order, turn),
      onlineTurn: order.onlineTurn,
    })),
    { size, currentTurn: turn, sectorHasPlants: stock > 0, rounding: aiOwned ? "nearest" : "floor" }
  );
  const rewriteOf = new Map(open.map((order, i) => [order, recount.orders[i]]));
  let ordersRewritten = 0;
  let ordersCancelled = 0;
  const queue: SectorBuildOrder[] = [];
  for (const order of original) {
    const result = rewriteOf.get(order);
    if (!result) {
      queue.push(order);
      continue;
    }
    if (result.kind === "cancel") {
      ordersCancelled++;
      continue;
    }
    ordersRewritten++;
    queue.push({
      ...order,
      unitsOrdered: result.unitsOrdered,
      costPaidAnchor: result.costPaidAnchor,
      startTurn: result.startTurn,
      plantUnits: size,
    });
  }
  const orderRefundAnchor = recount.refundAnchor;
  const starterRoundedUp = recount.roundedUp ? 1 : 0;

  const stockCreditAnchor = stockResult?.creditAnchor ?? 0;
  const plantsAfter = stockResult?.plants ?? 0;
  const set: Record<string, unknown> = {
    capitalStock: stockResult?.capitalStock ?? stock,
    plantCount: plantsAfter,
    plantUnitRemainder: 0,
    plantWearUnits: 0,
    buildQueue: queue,
  };
  if (stockResult) set.capacityBookAnchor = stockResult.capacityBookAnchor;
  if (sector.buildQueue && sector.buildQueue.length > 0)
    set.constructionInProgressAnchor = queueUndeliveredCost(queue, turn);

  return {
    sectorId: sector._id.toHexString(),
    corporationId: sector.corporationId.toHexString(),
    countryId: String(sector.countryId ?? ""),
    sectorType: sector.sectorType,
    cohort: input.cohort,
    aiOwned,
    size,
    priorStock: typeof sector.capitalStock === "number" ? sector.capitalStock : null,
    priorQueue: sector.buildQueue ?? null,
    set,
    stockCreditAnchor,
    orderRefundAnchor,
    creditAnchor: stockCreditAnchor + orderRefundAnchor,
    remainderUnits: stockResult?.remainderUnits ?? 0,
    plantsBefore: Math.floor(stock / size),
    plantsAfter,
    roundedUp: stockResult?.roundedUp ?? false,
    ordersRewritten,
    ordersCancelled,
    starterRoundedUp,
    financedOrdersKept,
    orderFreeUnits: recount.freeUnits,
  };
}

/** Stable id for a sector's credit at a conversion turn. */
export function conversionKey(sectorId: string, turn: number): string {
  return `${sectorId}_${turn}`;
}

function conversionTxId(key: string): ObjectId {
  return new ObjectId(createHash("sha256").update(`wholePlants:${key}`).digest("hex").slice(0, 24));
}

const SECTOR_PROJECTION = {
  _id: 1,
  corporationId: 1,
  countryId: 1,
  stateId: 1,
  sectorType: 1,
  industryModel: 1,
  mediaDiscriminator: 1,
  strategyId: 1,
  capitalStock: 1,
  capacityBookAnchor: 1,
  buildQueue: 1,
  constructionInProgressAnchor: 1,
  [SECTOR_MARKER]: 1,
} as const;

interface WorldFacts {
  turn: number;
  isProcessing: boolean;
  year: number;
  preset: string;
  unitScale: number;
}

async function loadWorld(db: Db): Promise<WorldFacts> {
  const gs = await db
    .collection<{
      _id: string;
      currentTurn?: number;
      currentYear?: number;
      isProcessing?: boolean;
      preset?: string | null;
    }>("gameState")
    .findOne({}, { projection: { currentTurn: 1, currentYear: 1, isProcessing: 1, preset: 1 } });
  const turn = gs?.currentTurn ?? 0;
  return {
    turn,
    isProcessing: gs?.isProcessing === true,
    year: resolveWorldYear(gs?.currentYear, turn),
    preset: resolvePresetIdFromGameState(gs),
    unitScale: await loadWorldEraUnitScale(db),
  };
}

export interface ConversionReport {
  turn: number;
  isProcessing: boolean;
  conversions: SectorConversion[];
  sectorsScanned: number;
  totals: {
    creditAnchor: number;
    stockCreditAnchor: number;
    orderRefundAnchor: number;
    sectorsCredited: number;
    roundedUpSectors: number;
    roundedUpByCohort: Record<Cohort, number>;
    /** Capacity units given free by rounding sectors below one plant up to one. */
    roundUpUnits: number;
    roundUpUnitsBySectorType: Record<string, number>;
    ordersRewritten: number;
    ordersCancelled: number;
    starterRoundedUp: number;
    financedOrdersKept: number;
    /** Capacity units the order recount adds at no charge, by owner. */
    orderFreeUnits: Record<Cohort, number>;
    /** Sectors whose pooled orders rounded up to the nearest plant. */
    orderRoundUpSectors: Record<Cohort, number>;
    /** Sectors with an in-flight order refund, by owner. */
    orderRefundSectors: Record<Cohort, number>;
    orderRefundByCohort: Record<Cohort, number>;
    plantsBefore: number;
    plantsAfter: number;
  };
  byCohort: Record<Cohort, { sectors: number; creditAnchor: number }>;
  byCountry: Record<string, { sectors: number; creditAnchor: number }>;
}

/** READ ONLY. Everything the conversion would do. */
export async function buildConversionReport(db: Db): Promise<ConversionReport> {
  const world = await loadWorld(db);
  const sectors = await db
    .collection<SectorRow>("corporateSectors")
    .find(
      { $or: [{ capitalStock: { $gt: 0 } }, { "buildQueue.0": { $exists: true } }] },
      { projection: SECTOR_PROJECTION }
    )
    .toArray();
  const pending = sectors.filter((s) => needsConversion(s, world.turn));
  const corpIds = [...new Set(pending.map((s) => s.corporationId.toHexString()))];
  const corps = await db
    .collection<CorpRow>("corporations")
    .find(
      { _id: { $in: corpIds.map((id) => new ObjectId(id)) } },
      {
        projection: {
          _id: 1,
          ceoType: 1,
          countryOwnerId: 1,
          countryId: 1,
          liquidCurrencyCode: 1,
        },
      }
    )
    .toArray();
  const corpById = new Map(corps.map((c) => [c._id.toHexString(), c]));

  const conversions = pending.map((sector) => {
    const corp = corpById.get(sector.corporationId.toHexString());
    return convertSector(sector, {
      turn: world.turn,
      cohort: cohortOf(corp),
      aiOwned: isAiOwned(corp),
      listPricePerUnitAnchor: capacityPricePerUnit(
        sector.sectorType as OperatingSectorType,
        world.year,
        world.unitScale,
        sector.strategyId ?? null,
        sector.industryModel,
        sector.mediaDiscriminator,
        world.preset
      ),
    });
  });

  const zero = () => ({ sectors: 0, creditAnchor: 0 });
  const byCohort: ConversionReport["byCohort"] = { player: zero(), npp: zero(), state: zero() };
  const byCountry: ConversionReport["byCountry"] = {};
  const totals: ConversionReport["totals"] = {
    creditAnchor: 0,
    stockCreditAnchor: 0,
    orderRefundAnchor: 0,
    sectorsCredited: 0,
    roundedUpSectors: 0,
    roundedUpByCohort: { player: 0, npp: 0, state: 0 },
    roundUpUnits: 0,
    roundUpUnitsBySectorType: {},
    ordersRewritten: 0,
    ordersCancelled: 0,
    starterRoundedUp: 0,
    financedOrdersKept: 0,
    orderFreeUnits: { player: 0, npp: 0, state: 0 },
    orderRoundUpSectors: { player: 0, npp: 0, state: 0 },
    orderRefundSectors: { player: 0, npp: 0, state: 0 },
    orderRefundByCohort: { player: 0, npp: 0, state: 0 },
    plantsBefore: 0,
    plantsAfter: 0,
  };
  for (const c of conversions) {
    totals.creditAnchor += c.creditAnchor;
    totals.stockCreditAnchor += c.stockCreditAnchor;
    totals.orderRefundAnchor += c.orderRefundAnchor;
    if (c.creditAnchor > 0) totals.sectorsCredited++;
    if (c.roundedUp) {
      const free = c.size - (c.priorStock ?? 0);
      totals.roundedUpSectors++;
      totals.roundedUpByCohort[c.cohort]++;
      totals.roundUpUnits += free;
      totals.roundUpUnitsBySectorType[c.sectorType] =
        (totals.roundUpUnitsBySectorType[c.sectorType] ?? 0) + free;
    }
    totals.ordersRewritten += c.ordersRewritten;
    totals.ordersCancelled += c.ordersCancelled;
    totals.starterRoundedUp += c.starterRoundedUp;
    totals.financedOrdersKept += c.financedOrdersKept;
    totals.orderFreeUnits[c.cohort] += c.orderFreeUnits;
    if (c.orderFreeUnits > 0 && c.starterRoundedUp === 0) totals.orderRoundUpSectors[c.cohort]++;
    if (c.orderRefundAnchor > 0) totals.orderRefundSectors[c.cohort]++;
    totals.orderRefundByCohort[c.cohort] += c.orderRefundAnchor;
    totals.plantsBefore += c.plantsBefore;
    totals.plantsAfter += c.plantsAfter;
    byCohort[c.cohort].sectors++;
    byCohort[c.cohort].creditAnchor += c.creditAnchor;
    const country = (byCountry[c.countryId] ??= zero());
    country.sectors++;
    country.creditAnchor += c.creditAnchor;
  }

  return {
    turn: world.turn,
    isProcessing: world.isProcessing,
    conversions,
    sectorsScanned: sectors.length,
    totals,
    byCohort,
    byCountry,
  };
}

/** Converted sectors whose owner credit or tx row has not landed yet. */
async function pendingCredits(db: Db) {
  const credited = await db
    .collection<CorporateSector & { [SECTOR_MARKER]?: Record<string, unknown> }>("corporateSectors")
    .find(
      { [`${SECTOR_MARKER}.creditAnchor`]: { $gt: 0 } },
      {
        projection: {
          _id: 1,
          corporationId: 1,
          sectorType: 1,
          [SECTOR_MARKER]: 1,
        },
      }
    )
    .toArray();
  const rows = credited.map((s) => {
    const marker = s[SECTOR_MARKER] as {
      turn: number;
      creditAnchor: number;
      remainderUnits?: number;
      corporationId?: string;
    };
    const key = conversionKey(s._id.toHexString(), marker.turn);
    return {
      sectorId: s._id,
      sectorType: s.sectorType,
      // The owner at conversion time is paid, even if the sector moved since.
      corporationId: marker.corporationId ? new ObjectId(marker.corporationId) : s.corporationId,
      turn: marker.turn,
      creditAnchor: marker.creditAnchor,
      remainderUnits: marker.remainderUnits ?? 0,
      key,
      txId: conversionTxId(key),
    };
  });
  const corpIds = [...new Set(rows.map((r) => r.corporationId.toHexString()))].map(
    (id) => new ObjectId(id)
  );
  const corps = await db
    .collection<CorpRow & { remediation?: Record<string, Record<string, unknown>> }>("corporations")
    .find(
      { _id: { $in: corpIds } },
      {
        projection: {
          _id: 1,
          name: 1,
          sequentialId: 1,
          countryId: 1,
          liquidCurrencyCode: 1,
          [CORP_MARKER]: 1,
        },
      }
    )
    .toArray();
  const corpById = new Map(corps.map((c) => [c._id.toHexString(), c]));
  const txIds = rows.map((r) => r.txId);
  const existingTx = new Set(
    (
      await db
        .collection("financialTxLog")
        .find({ _id: { $in: txIds } }, { projection: { _id: 1 } })
        .toArray()
    ).map((d) => String(d._id))
  );
  return rows.map((r) => {
    const corp = corpById.get(r.corporationId.toHexString());
    return {
      ...r,
      corp,
      credited: corp?.remediation?.[DEFECT_ID]?.[r.key] != null,
      txWritten: existingTx.has(String(r.txId)),
    };
  });
}

async function invariantViolations(db: Db): Promise<number> {
  const converted = await db
    .collection<SectorRow>("corporateSectors")
    .find({ [SECTOR_MARKER]: { $exists: true } }, { projection: SECTOR_PROJECTION })
    .toArray();
  return converted.filter((s) => !isWholePlantStock(s.capitalStock ?? 0, plantSizeForSector(s)))
    .length;
}

async function detect(db: Db): Promise<DetectResult> {
  const report = await buildConversionReport(db);
  const credits = await pendingCredits(db);
  const uncredited = credits.filter((c) => !c.credited || !c.txWritten);
  return {
    affected: report.conversions.length + uncredited.length,
    sample: report.conversions.slice(0, 10).map((c) => ({
      sectorId: c.sectorId,
      size: c.size,
      priorStock: c.priorStock,
      plantsAfter: c.plantsAfter,
      creditAnchor: Math.round(c.creditAnchor),
    })),
    notes: [
      `turn ${report.turn}: ${report.conversions.length} of ${report.sectorsScanned} sectors to recount`,
      `${uncredited.length} converted sectors with an owner credit or tx row still to land`,
    ],
  };
}

async function plan(db: Db): Promise<HealPlan> {
  const report = await buildConversionReport(db);
  const credits = await pendingCredits(db);
  const uncredited = credits.filter((c) => !c.credited || !c.txWritten);
  const sectorIds = report.conversions.map((c) => c.sectorId);
  const corpIds = [
    ...new Set([
      ...report.conversions.filter((c) => c.creditAnchor > 0).map((c) => c.corporationId),
      ...uncredited.map((c) => c.corporationId.toHexString()),
    ]),
  ];
  const moneyDelta =
    report.totals.creditAnchor +
    uncredited.filter((c) => !c.credited).reduce((sum, c) => sum + c.creditAnchor, 0);
  return {
    affected: report.conversions.length + uncredited.length,
    touched: [
      { collection: "corporateSectors", ids: sectorIds },
      { collection: "corporations", ids: corpIds },
    ],
    moneyDelta: Math.round(moneyDelta),
    summary:
      `Recount ${report.conversions.length} sectors to whole plants at turn ${report.turn}; ` +
      `credit ₳${Math.round(report.totals.creditAnchor).toLocaleString("en-US")} to ` +
      `${report.totals.sectorsCredited} sectors' owners; ${report.totals.roundedUpSectors} ` +
      `sectors below one plant round up to one.`,
    notes: [
      `orders rewritten ${report.totals.ordersRewritten}, cancelled ${report.totals.ordersCancelled}, ` +
        `starters rounded up ${report.totals.starterRoundedUp}, financed kept ${report.totals.financedOrdersKept}`,
    ],
    payload: { turn: report.turn, conversions: report.conversions },
  };
}

async function inBatches<T>(items: readonly T[], run: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH)
    await Promise.all(items.slice(i, i + BATCH).map(run));
}

async function apply(db: Db, healPlan: HealPlan, ctx: HealContext): Promise<HealResult> {
  const { turn, conversions } = healPlan.payload as {
    turn: number;
    conversions: SectorConversion[];
  };
  const sectors = db.collection("corporateSectors");
  let converted = 0;
  let casMisses = 0;

  // 1. Sector recount, compare-and-swap on the planned stock and queue.
  await inBatches(conversions, async (c) => {
    const filter: Record<string, unknown> = {
      _id: new ObjectId(c.sectorId),
      $or: [{ [SECTOR_MARKER]: { $exists: false } }, { [`${SECTOR_MARKER}.turn`]: { $lt: turn } }],
      capitalStock: c.priorStock,
      buildQueue: c.priorQueue ?? { $exists: false },
    };
    const res = await sectors.updateOne(filter, {
      $set: {
        ...c.set,
        updatedAt: ctx.now,
        [SECTOR_MARKER]: {
          turn,
          runId: ctx.runId ?? null,
          corporationId: c.corporationId,
          creditAnchor: c.creditAnchor,
          stockCreditAnchor: c.stockCreditAnchor,
          orderRefundAnchor: c.orderRefundAnchor,
          remainderUnits: c.remainderUnits,
          roundedUp: c.roundedUp,
          priorStock: c.priorStock,
        },
      },
    });
    if (res.modifiedCount === 1) converted++;
    else casMisses++;
  });

  // 2 and 3. Owner credit and its tx row, each idempotent per sector.
  const fx = await loadFxRatesByCurrency(db);
  const thresholds = await loadTxThresholds(db);
  const credits = (await pendingCredits(db)).filter((c) => !c.credited || !c.txWritten);
  let credited = 0;
  let txWritten = 0;
  let txFailed = 0;
  await inBatches(credits, async (c) => {
    if (!c.corp) return;
    const rate = fxRateForCorpFromMap(c.corp, fx);
    const amountLocal = anchorToCorpLiquidCapital(c.creditAnchor, c.corp, rate);
    if (!c.credited) {
      const res = await db.collection("corporations").updateOne(
        { _id: c.corporationId, [`${CORP_MARKER}.${c.key}`]: { $exists: false } },
        {
          $inc: { liquidCapital: amountLocal },
          $set: {
            updatedAt: ctx.now,
            [`${CORP_MARKER}.${c.key}`]: {
              creditAnchor: c.creditAnchor,
              creditLocal: amountLocal,
              runId: ctx.runId ?? null,
            },
          },
        }
      );
      if (res.modifiedCount === 1) credited++;
    }
    if (!c.txWritten) {
      const outcome = await emitTx(
        db,
        buildCapexTxEntry({
          corporationId: c.corporationId,
          corporationName: c.corp.name ?? "",
          corporationSequentialId: c.corp.sequentialId,
          direction: "refund",
          amountLocal,
          currencyCode: (resolveCorpLiquidCurrencyCode(c.corp) ?? "USD") as CurrencyCode,
          anchorAmount: c.creditAnchor,
          turn: c.turn,
          createdAt: ctx.now,
          sectorId: c.sectorId,
          sectorType: c.sectorType,
          units: c.remainderUnits,
          meta: {
            wholePlantConversion: true,
            conversionTurn: c.turn,
            idempotencyKey: `wholePlants:${c.key}`,
          },
        }),
        thresholds,
        { _id: c.txId }
      );
      if (outcome === "applied") txWritten++;
      else if (outcome === "failed") txFailed++;
    }
  });

  return {
    documentsScanned: conversions.length,
    documentsUpdated: converted + credited,
    documentsInserted: txWritten,
    notes: [
      `turn ${turn}: ${converted} sectors recounted, ${casMisses} changed since the plan and skipped`,
      `${credited} owner credits, ${txWritten} tx rows written, ${txFailed} tx rows failed`,
    ],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const report = await buildConversionReport(db);
  const credits = await pendingCredits(db);
  const uncredited = credits.filter((c) => !c.credited || !c.txWritten);
  const broken = await invariantViolations(db);
  const remaining = report.conversions.length + uncredited.length + broken;
  return {
    ok: remaining === 0,
    remaining,
    notes: [
      `${report.conversions.length} sectors still to recount`,
      `${uncredited.length} owner credits or tx rows still to land`,
      `${broken} converted sectors not a whole number of plants (capitalStock % size != 0)`,
    ],
  };
}

export const defect: Defect = {
  id: DEFECT_ID,
  title: "Whole plants: recount every sector to whole plants and credit part-plants",
  severity: "P2",
  codeFix: {
    mergedTo: "development",
  },
  seedFix: {
    status: "not-needed",
    note:
      "Seeds write continuous stock. With wholePlantsStage on, the turn snaps any part-plant " +
      "to credit on the first turn, so a reset world needs no conversion and no refund.",
  },
  envs: ["dev", "sandbox", "prod"],
  idempotent: true,
  mintsMoney: true,
  guards: ["turn-lock-free", "max-affected:20000"],
  detect: (db: Db) => detect(db),
  plan: (db: Db) => plan(db),
  apply,
  verify: (db: Db) => verify(db),
};
