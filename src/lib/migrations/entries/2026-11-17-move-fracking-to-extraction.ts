import type { CorpCapitalCurrencyInfo } from "@/lib/currency/corporationCapital";
import { withSessionDb } from "@/lib/db/sessionDb";
import {
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
  corpCapitalToAnchor,
  anchorToCorpCapital,
} from "@/lib/currency/corporationCapital";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { ObjectId, type Db, type Document } from "mongodb";
import type { Migration, MigrationContext, MigrationResult } from "../types";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { unitYieldForSupply } from "@/lib/corporations/rules/capacityEconomy";
import { rescaleOtherOpexAnchorForRetool } from "@/lib/corporations/physicalPnl";
import { seedPlantLedger } from "@/lib/corporations/plantLedger";
import { emitTx } from "@/lib/financialTxLog/emit";
import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";

/**
 * Hydraulic Fracturing is an extraction method now, not an energy method.
 * Energy sectors still running it return to Conventional with the same
 * nameplate value, and the retool fee they paid is refunded once.
 */

export const LEGACY_METHOD = "fracking";
export const ENERGY_DEFAULT = "standard";

/** The recipe the method had when it was removed; the registry no longer holds it. */
export const LEGACY_SUPPLY = { energy: 0.6, oil: 0.14, natural_gas: 0.14 } as const;
const CONVENTIONAL_SUPPLY = { energy: 0.65 } as const;

/** Stock units of the old method express the same nameplate as this many Conventional units. */
export function legacyToConventionalRatio(): number {
  const from = unitYieldForSupply(LEGACY_SUPPLY, 1);
  const to = unitYieldForSupply(CONVENTIONAL_SUPPLY, 1);
  if (!(from > 0) || !(to > 0)) return 1;
  return to / from;
}

interface SectorLike {
  _id: ObjectId;
  corporationId: ObjectId;
  sectorType?: string;
  capitalStock?: number;
  retoolRescaleApplied?: boolean;
  otherOpexPerUnitAnchor?: number | null;
  buildQueue?: Array<Document & { unitsOrdered?: number; strategyId?: string | null }>;
}

/** The write that returns one sector to Conventional. Pure: no I/O. */
export function conventionalPatch(sector: SectorLike, ratio: number): Document {
  const rescale = sector.retoolRescaleApplied === true;
  const set: Document = { strategyId: ENERGY_DEFAULT, updatedAt: new Date() };
  if (rescale && typeof sector.capitalStock === "number" && Number.isFinite(sector.capitalStock)) {
    const stock = sector.capitalStock * ratio;
    set.capitalStock = stock;
    Object.assign(set, seedPlantLedger({ ...sector, strategyId: ENERGY_DEFAULT } as never, stock));
  }
  if (rescale) {
    const opex = rescaleOtherOpexAnchorForRetool(sector.otherOpexPerUnitAnchor, ratio);
    if (opex != null) set.otherOpexPerUnitAnchor = opex;
  }
  if (Array.isArray(sector.buildQueue) && sector.buildQueue.length > 0) {
    set.buildQueue = sector.buildQueue.map((order) => ({
      ...order,
      ...(rescale && typeof order.unitsOrdered === "number" && order.unitsOrdered > 0
        ? { unitsOrdered: order.unitsOrdered * ratio }
        : {}),
      ...(order.strategyId === LEGACY_METHOD ? { strategyId: ENERGY_DEFAULT } : {}),
    }));
  }
  return {
    $set: set,
    $unset: {
      transitionFromStrategyId: "",
      transitionStartTurn: "",
      transitionCooldownUntilTurn: "",
      isReversing: "",
      retoolRescaleApplied: "",
    },
  };
}

async function refundRetoolFee(
  db: Db,
  sector: SectorLike
): Promise<{ refunded: boolean; amount: number; reconciliationRequired?: boolean }> {
  const fees = await financialTxLogCollection<Document>(db)
    .find({
      type: "corp_sector_retool",
      "meta.sectorId": sector._id.toString(),
      "meta.action": "retool",
      "meta.toStrategyId": LEGACY_METHOD,
    })
    .toArray();
  if (fees.length === 0) return { refunded: false, amount: 0 };
  const corp = await corporationsCollection<Document & CorpCapitalCurrencyInfo>(db).findOne({
    _id: sector.corporationId,
  });
  if (!corp) return { refunded: false, amount: 0 };
  const currencyCode = resolveCorpLiquidCurrencyCode(corp);
  if (!currencyCode) throw new Error("Retool refund requires the corporation's currency");
  const needsConversion = fees.some((fee) => fee.currencyCode !== currencyCode);
  const rates = needsConversion ? await loadFxRatesByCurrency(db) : new Map<string, number>();
  let amount = 0;
  for (const fee of fees) {
    if (
      typeof fee.amount !== "number" ||
      !Number.isFinite(fee.amount) ||
      fee.amount > 0 ||
      typeof fee.currencyCode !== "string"
    )
      throw new Error("Retool refund requires a valid original fee receipt");
    const native = -fee.amount;
    if (fee.currencyCode === currencyCode) amount += native;
    else {
      const from = rates.get(fee.currencyCode),
        to = rates.get(currencyCode);
      if (!(
        typeof from === "number" &&
        Number.isFinite(from) &&
        from > 0 &&
        typeof to === "number" &&
        Number.isFinite(to) &&
        to > 0
      ))
        throw new Error("Retool refund requires current currency quotes");
      amount += anchorToCorpCapital(
        corpCapitalToAnchor(native, fee.currencyCode as CurrencyCode, from),
        currencyCode,
        to
      );
    }
  }
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid retool refund total");
  if (amount === 0) return { refunded: false, amount: 0 };
  // The sector id doubles as the refund row id, so a rerun converges instead of paying twice.
  const outcome = await emitTx(
    db,
    {
      type: "corp_sector_retool",
      turn: typeof fees[0]?.turn === "number" ? fees[0].turn : 0,
      createdAt: new Date(),
      subjectType: "corporation",
      subjectId: sector.corporationId,
      subjectName: corp.name ?? "Corporation",
      ...(corp.sequentialId !== undefined ? { subjectSequentialId: corp.sequentialId } : {}),
      amount,
      currencyCode,
      meta: {
        action: "retire_refund",
        sectorId: sector._id.toString(),
        sectorType: "energy",
        fromStrategyId: LEGACY_METHOD,
        toStrategyId: ENERGY_DEFAULT,
      },
    } as never,
    undefined,
    { _id: sector._id }
  );
  if (outcome === "already-applied")
    return { refunded: false, amount: 0, reconciliationRequired: true };
  if (outcome !== "applied") throw new Error("Retool refund receipt could not be published");
  const credited = await corporationsCollection<Document>(db).updateOne(
    { _id: sector.corporationId },
    { $inc: { liquidCapital: amount }, $set: { updatedAt: new Date() } }
  );
  if (credited.matchedCount !== 1) throw new Error("Retool refund recipient changed");
  return { refunded: true, amount };
}

async function relabelLeftovers(db: Db, dryRun: boolean): Promise<number> {
  const sectors = corporateSectorsCollection<Document>(db);
  const moves: Array<[Document, Document, Document[] | undefined]> = [
    [
      { transitionFromStrategyId: LEGACY_METHOD },
      { $set: { transitionFromStrategyId: ENERGY_DEFAULT } },
      undefined,
    ],
    [
      { "parentDirectedStrategy.strategyId": LEGACY_METHOD },
      { $set: { "parentDirectedStrategy.strategyId": ENERGY_DEFAULT } },
      undefined,
    ],
    [
      { "buildQueue.strategyId": LEGACY_METHOD },
      { $set: { "buildQueue.$[order].strategyId": ENERGY_DEFAULT } },
      [{ "order.strategyId": LEGACY_METHOD }],
    ],
  ];
  let touched = 0;
  for (const [filter, update, arrayFilters] of moves) {
    if (dryRun) {
      touched += await sectors.countDocuments(filter);
      continue;
    }
    const res = await sectors.updateMany(filter, update, arrayFilters ? { arrayFilters } : {});
    touched += res.modifiedCount;
  }
  return touched;
}

export const migration: Migration = {
  id: "2026-11-17-move-fracking-to-extraction",
  description:
    "Return energy sectors on the removed fracking method to Conventional, keeping capacity and refunding the retool fee.",
  idempotent: true,
  async execute(db: Db, ctx: MigrationContext): Promise<MigrationResult> {
    return withSessionDb(db, async (db) => {
      const sectors = corporateSectorsCollection<Document>(db);
      const onMethod = await corporateSectorsCollection<SectorLike & Document>(db)
        .find({ strategyId: LEGACY_METHOD })
        .toArray();
      const ratio = legacyToConventionalRatio();
      let moved = 0;
      let refunds = 0;
      let ambiguousRefunds = 0;
      if (!ctx.dryRun) {
        for (const sector of onMethod) {
          const fee = await refundRetoolFee(db, sector);
          if (fee.refunded) refunds += 1;
          if (fee.reconciliationRequired) ambiguousRefunds += 1;
          const res = await sectors.updateOne(
            { _id: sector._id, strategyId: LEGACY_METHOD },
            conventionalPatch(sector, ratio)
          );
          moved += res.modifiedCount;
        }
      }
      const leftovers = await relabelLeftovers(db, ctx.dryRun);
      return {
        documentsScanned: onMethod.length,
        documentsUpdated: moved + leftovers,
        notes: [
          `sectors on fracking: ${onMethod.length}, moved to ${ENERGY_DEFAULT}: ${moved}`,
          `retool fees refunded: ${refunds}`,
          `stray references relabelled: ${leftovers}`,
          `existing refund receipts requiring payment verification: ${ambiguousRefunds}`,
        ],
      };
    });
  },
};
