/**
 * Market recovery stage 5 (kanban 254504): AI companies hand off-type plants to
 * a same-type AI company.
 *
 * Any sector whose type differs from its corporation's type carries the -15
 * type-mismatch margin penalty (specialization/rules.ts). At turn 273, 4,306 of
 * 7,978 producing plants carried it and 3,796 belonged to AI companies, which
 * built across industries. The owner kept the penalty; instead each standalone
 * AI company sells at most one off-type plant per turn, at book value plus
 * inventory, to an existing AI company of the plant's type in the same country
 * that can pay. Nothing is deleted: the plant row is re-parented whole
 * (capacity, crew, inventory, build queue, production history).
 *
 * Deferred, not forced: plants with secured construction, defence contracts or
 * an active supply agreement on one of their outputs, extraction plants, and
 * cross-currency pairs wait. Player, caretaker, state and subsidiary companies
 * are never sellers or buyers.
 *
 * Crash safety: one keyed receipt per (turn, sector) in `offTypeHandovers`,
 * advanced pending -> debited -> moved -> done, one bulk write per leg. Buyer
 * debits and seller credits carry a per-turn marker on the corporation, so a
 * retried turn resumes from the recorded leg without repeating a money move.
 * Buyers share the seller's currency, so re-parenting needs no re-denomination.
 */
import type { Db, ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import { isNppOwned } from "@/lib/corporations/nppOwned";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { getControllingCorporateParent } from "@/lib/corporations/corporateOwnership";
import { getSectorTypeMatchModifier } from "@/lib/corporations/specialization/rules";
import { hasProtectedConstructionProperty } from "@/lib/corporations/securedConstructionProperty";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { unprotectedConstructionPropertyFilter } from "@/lib/corporations/securedConstructionProperty";
import { sectorBookValueAnchor } from "@/lib/corporations/sectorProfitBasis";
import {
  anchorToCorpLiquidCapital,
  getCorpFxRate,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { emitTxBulk, loadTxThresholds } from "@/lib/financialTxLog/emit";
import {
  MARKET_RECOVERY_STAGE,
  marketRecoveryStageActive,
  normalizeMarketRecoveryStage,
} from "@/lib/market/marketRecoveryStages";

/** A standalone AI company: not player, caretaker, state-owned or a subsidiary. */
export function isStandaloneAiCompany(corp: Corporation): boolean {
  return isNppOwned(corp) && !isStateOwned(corp) && !getControllingCorporateParent(corp);
}

type TypedCorp = { type?: string | null; secondaryType?: string | null };

/** True when the sector carries the type-mismatch penalty for its owner. */
export function isOffType(corp: TypedCorp, sectorType: string): boolean {
  if (!corp.type) return false;
  return getSectorTypeMatchModifier(sectorType, corp.type, corp.secondaryType) < 0;
}

/** True when the buyer's primary type is the sector's type. */
export function isSameType(corp: TypedCorp, sectorType: string): boolean {
  return Boolean(corp.type) && corp.type === sectorType;
}

/** Lowest-margin first, sector id as a stable tie-break. */
export function pickHandoverSector<
  T extends { _id: ObjectId; plantsPnl?: { revenue: number; profit?: number } | null },
>(rows: T[]): T | null {
  const margin = (r: T) =>
    r.plantsPnl && r.plantsPnl.revenue > 0 ? (r.plantsPnl.profit ?? 0) / r.plantsPnl.revenue : 0;
  return (
    [...rows].sort(
      (a, b) => margin(a) - margin(b) || a._id.toString().localeCompare(b._id.toString())
    )[0] ?? null
  );
}

interface HandoverReceipt {
  _id: string;
  turn: number;
  sectorId: ObjectId;
  sellerId: ObjectId;
  buyerId: ObjectId;
  priceAnchor: number;
  priceLocal: number;
  currency: string;
  state: "pending" | "debited" | "moved" | "done" | "deferred" | "failed";
  at: Date;
  reason?: string;
}

/**
 * Per-turn idempotency markers on the corporation documents. A buyer is debited
 * and a seller credited at most once per turn, so one marker per side is enough
 * to make each bulk money leg safe to replay.
 */
const DEBIT_MARK = "offTypeHandoverDebitKey";
const CREDIT_MARK = "offTypeHandoverCreditKey";

const laneKey = (corpId: ObjectId | string, s: CorporateSector) =>
  `${corpId}|${s.stateId}|${s.sectorType}|${s.industryModel ?? ""}|${s.mediaDiscriminator ?? ""}`;

async function bulkIgnoringWriteErrors(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    // Unordered bulk writes apply every op they can; per-op failures (a lane
    // that appeared since planning, a duplicate receipt) are caught by the
    // read-back that follows each leg.
    if ((error as { name?: string })?.name !== "MongoBulkWriteError") throw error;
  }
}

export async function runOffTypeHandover(
  db: Db,
  args: {
    turn: number;
    year: number | null;
    eraUnitScale: number;
    stage: number | null | undefined;
  }
): Promise<{ moved: number; deferred: number }> {
  const out = { moved: 0, deferred: 0 };
  if (!marketRecoveryStageActive(args.stage, MARKET_RECOVERY_STAGE.AI_OFF_TYPE_HANDOVER))
    return out;
  const corpsCol = db.collection<Corporation>("corporations");
  const sectorsCol = db.collection<CorporateSector>("corporateSectors");
  const receipts = db.collection<HandoverReceipt>("offTypeHandovers");

  const corps = (await corpsCol.find({ ceoType: "npp" }).toArray()).filter(isStandaloneAiCompany);
  if (corps.length === 0) return out;
  const corpById = new Map(corps.map((c) => [c._id.toString(), c]));
  const [sectors, contractSectorIds, activeAgreements, priorReceipts] = await Promise.all([
    sectorsCol.find({ corporationId: { $in: corps.map((c) => c._id) } }).toArray(),
    db
      .collection("defenceContracts")
      .distinct("sectorId", { status: { $nin: ["cancelled", "completed", "expired"] } }),
    db
      .collection("supplyAgreements")
      .find(
        { status: { $in: ["active", "pending", "cancelling"] } },
        { projection: { supplierCorpId: 1, commodity: 1 } }
      )
      .toArray(),
    receipts.find({ turn: args.turn }).toArray(),
  ]);
  const contracted = new Set(contractSectorIds.map((id) => String(id)));
  const agreementKeys = new Set(activeAgreements.map((a) => `${a.supplierCorpId}|${a.commodity}`));

  // ---- Plan (pure): one sale per seller, one purchase per buyer. ----
  const sellersDone = new Set(priorReceipts.map((r) => r.sellerId.toString()));
  const buyersUsed = new Set(priorReceipts.map((r) => r.buyerId.toString()));
  const ownedLanes = new Set(sectors.map((s) => laneKey(s.corporationId, s)));
  const capacityByCorpType = new Map<string, number>();
  const bySeller = new Map<string, CorporateSector[]>();
  for (const s of sectors) {
    const k = `${s.corporationId}|${s.sectorType}`;
    capacityByCorpType.set(k, (capacityByCorpType.get(k) ?? 0) + (Number(s.capitalStock) || 0));
    const seller = corpById.get(s.corporationId.toString());
    if (!seller || sellersDone.has(seller._id.toString()) || !isOffType(seller, s.sectorType))
      continue;
    if (s.sectorType === "extraction" || hasProtectedConstructionProperty(s)) continue;
    if (contracted.has(s._id.toString())) continue;
    if (
      Object.keys(s.soldByCommodity ?? {}).some((c) => agreementKeys.has(`${s.corporationId}|${c}`))
    )
      continue;
    const list = bySeller.get(s.corporationId.toString()) ?? [];
    list.push(s);
    bySeller.set(s.corporationId.toString(), list);
  }

  const fxByCorp = new Map<string, number>();
  const planned: HandoverReceipt[] = [];
  const now = new Date();
  for (const [sellerId, rows] of [...bySeller].sort(([a], [b]) => a.localeCompare(b))) {
    const seller = corpById.get(sellerId)!;
    const sector = pickHandoverSector(rows);
    if (!sector) continue;
    const currency = resolveCorpLiquidCurrencyCode(seller);
    const buyer =
      corps
        .filter(
          (c) =>
            !c._id.equals(seller._id) &&
            !buyersUsed.has(c._id.toString()) &&
            c.countryId === seller.countryId &&
            isSameType(c, sector.sectorType) &&
            resolveCorpLiquidCurrencyCode(c) === currency &&
            !ownedLanes.has(laneKey(c._id, sector))
        )
        .sort(
          (a, b) =>
            (capacityByCorpType.get(`${a._id}|${sector.sectorType}`) ?? 0) -
              (capacityByCorpType.get(`${b._id}|${sector.sectorType}`) ?? 0) ||
            a._id.toString().localeCompare(b._id.toString())
        )[0] ?? null;
    if (!buyer) {
      out.deferred++;
      continue;
    }
    const priceAnchor = Math.max(
      0,
      sectorBookValueAnchor(sector as never, args.year, args.eraUnitScale, args.turn) +
        Math.max(0, Number(sector.inventoryValueAnchor) || 0)
    );
    planned.push({
      _id: `${args.turn}:${sector._id.toString()}`,
      turn: args.turn,
      sectorId: sector._id,
      sellerId: seller._id,
      buyerId: buyer._id,
      priceAnchor,
      priceLocal: 0,
      currency: currency ?? "USD",
      state: "pending",
      at: now,
    });
    buyersUsed.add(buyer._id.toString());
    ownedLanes.add(laneKey(buyer._id, sector));
  }

  // FX is per currency, not per row: resolve each distinct buyer once.
  const fxBuyers = [...new Set(planned.map((r) => r.buyerId.toString()))].map((id) =>
    corpById.get(id)!
  );
  const fxRates = await Promise.all(fxBuyers.map((c) => getCorpFxRate(db, c)));
  fxBuyers.forEach((c, i) => fxByCorp.set(c._id.toString(), fxRates[i]));
  const fresh = planned
    .map((r) => {
      const buyer = corpById.get(r.buyerId.toString())!;
      const priceLocal = Math.round(
        anchorToCorpLiquidCapital(r.priceAnchor, buyer, fxByCorp.get(r.buyerId.toString()) ?? 1)
      );
      return { ...r, priceLocal };
    })
    .filter((r) => {
      const buyer = corpById.get(r.buyerId.toString())!;
      const affordable = r.priceLocal > 0 && (Number(buyer.liquidCapital) || 0) >= r.priceLocal;
      if (!affordable) out.deferred++;
      return affordable;
    });
  if (fresh.length > 0) {
    await bulkIgnoringWriteErrors(() => receipts.insertMany(fresh, { ordered: false }));
  }

  // ---- Leg 1: debit buyers (guarded by cash and the per-turn marker). ----
  let open = await receipts
    .find({ turn: args.turn, state: { $in: ["pending", "debited", "moved"] } })
    .toArray();
  const pending = open.filter((r) => r.state === "pending");
  if (pending.length > 0) {
    await bulkIgnoringWriteErrors(() =>
      corpsCol.bulkWrite(
        pending.map((r) => ({
          updateOne: {
            filter: {
              _id: r.buyerId,
              liquidCapital: { $gte: r.priceLocal },
              [DEBIT_MARK]: { $ne: r._id },
            },
            update: {
              $inc: { liquidCapital: -r.priceLocal },
              $set: { [DEBIT_MARK]: r._id, updatedAt: now },
            },
          },
        })),
        { ordered: false }
      )
    );
    const debited = new Set(
      (
        await corpsCol
          .find(
            { [DEBIT_MARK]: { $in: pending.map((r) => r._id) } },
            { projection: { [DEBIT_MARK]: 1 } }
          )
          .toArray()
      ).map((c) => String((c as Record<string, unknown>)[DEBIT_MARK]))
    );
    await receipts.bulkWrite(
      pending.map((r) => ({
        updateOne: {
          filter: { _id: r._id, state: "pending" },
          update: debited.has(r._id)
            ? { $set: { state: "debited" as const } }
            : { $set: { state: "deferred" as const, reason: "Insufficient corporate funds" } },
        },
      })),
      { ordered: false }
    );
  }

  // ---- Leg 2: re-parent the plant row (non-merge path only). ----
  open = await receipts.find({ turn: args.turn, state: { $in: ["debited", "moved"] } }).toArray();
  const toMove = open.filter((r) => r.state === "debited");
  if (toMove.length > 0) {
    await bulkIgnoringWriteErrors(() =>
      sectorsCol.bulkWrite(
        toMove.map((r) => ({
          updateOne: {
            filter: {
              _id: r.sectorId,
              corporationId: r.sellerId,
              ...unprotectedConstructionPropertyFilter(),
            },
            update: { $set: { corporationId: r.buyerId, updatedAt: now }, $unset: { forSale: "" } },
          },
        })),
        { ordered: false }
      )
    );
    const owners = new Map(
      (
        await sectorsCol
          .find(
            { _id: { $in: toMove.map((r) => r.sectorId) } },
            { projection: { corporationId: 1 } }
          )
          .toArray()
      ).map((s) => [s._id.toString(), s.corporationId?.toString()])
    );
    const moved = toMove.filter((r) => owners.get(r.sectorId.toString()) === r.buyerId.toString());
    const failed = toMove.filter((r) => owners.get(r.sectorId.toString()) !== r.buyerId.toString());
    if (failed.length > 0) {
      // Refund exactly once: the refund clears the debit marker it matches on.
      await corpsCol.bulkWrite(
        failed.map((r) => ({
          updateOne: {
            filter: { _id: r.buyerId, [DEBIT_MARK]: r._id },
            update: {
              $inc: { liquidCapital: r.priceLocal },
              $unset: { [DEBIT_MARK]: "" },
              $set: { updatedAt: now },
            },
          },
        })),
        { ordered: false }
      );
      out.deferred += failed.length;
    }
    await receipts.bulkWrite(
      [
        ...moved.map((r) => ({
          updateOne: {
            filter: { _id: r._id, state: "debited" as const },
            update: { $set: { state: "moved" as const } },
          },
        })),
        ...failed.map((r) => ({
          updateOne: {
            filter: { _id: r._id, state: "debited" as const },
            update: {
              $set: { state: "failed" as const, reason: "Plant changed hands or became secured" },
            },
          },
        })),
      ],
      { ordered: false }
    );
  }

  // ---- Leg 3: credit sellers, close receipts, write the ledger. ----
  const toCredit = await receipts.find({ turn: args.turn, state: "moved" }).toArray();
  if (toCredit.length > 0) {
    await corpsCol.bulkWrite(
      toCredit.map((r) => ({
        updateOne: {
          filter: { _id: r.sellerId, [CREDIT_MARK]: { $ne: r._id } },
          update: {
            $inc: { liquidCapital: r.priceLocal },
            $set: { [CREDIT_MARK]: r._id, updatedAt: now },
          },
        },
      })),
      { ordered: false }
    );
    await receipts.bulkWrite(
      toCredit.map((r) => ({
        updateOne: {
          filter: { _id: r._id, state: "moved" as const },
          update: { $set: { state: "done" as const } },
        },
      })),
      { ordered: false }
    );
    const sectorById = new Map(sectors.map((s) => [s._id.toString(), s]));
    const entries = toCredit.flatMap((r) => {
      const buyer = corpById.get(r.buyerId.toString());
      const seller = corpById.get(r.sellerId.toString());
      const sector = sectorById.get(r.sectorId.toString());
      const meta = {
        kind: "off_type_handover",
        receiptId: r._id,
        sectorId: r.sectorId.toString(),
        sectorType: sector?.sectorType,
        stateId: sector?.stateId,
        priceAnchor: r.priceAnchor,
      };
      const common = {
        turn: args.turn,
        createdAt: now,
        subjectType: "corporation",
        currencyCode: r.currency,
        counterpartyType: "corporation",
        meta,
      } as const;
      return [
        {
          ...common,
          type: "corp_sector_purchase",
          subjectId: r.buyerId,
          subjectName: buyer?.name ?? "",
          amount: -r.priceLocal,
          counterpartyId: r.sellerId,
          counterpartyName: seller?.name ?? "",
        },
        {
          ...common,
          type: "corp_sector_sale",
          subjectId: r.sellerId,
          subjectName: seller?.name ?? "",
          amount: r.priceLocal,
          counterpartyId: r.buyerId,
          counterpartyName: buyer?.name ?? "",
        },
      ];
    });
    await emitTxBulk(db, entries as never, await loadTxThresholds(db));
    out.moved += toCredit.length;
  }
  return out;
}

/** Turn phase entry: reads the stage, clock and era scale, then runs. */
export async function processOffTypeHandover(db: Db, turn: number) {
  const [config, gameState] = await Promise.all([
    db
      .collection("gameConfig")
      .findOne({ _id: "default" as never }, { projection: { marketRecoveryStage: 1 } }),
    db
      .collection("gameState")
      .findOne({ _id: "current" as never }, { projection: { currentYear: 1 } }),
  ]);
  const stage = normalizeMarketRecoveryStage(config?.marketRecoveryStage);
  if (!marketRecoveryStageActive(stage, MARKET_RECOVERY_STAGE.AI_OFF_TYPE_HANDOVER)) {
    return { moved: 0, deferred: 0 };
  }
  return runOffTypeHandover(db, {
    turn,
    year: typeof gameState?.currentYear === "number" ? gameState.currentYear : null,
    eraUnitScale: await loadWorldEraUnitScale(db),
    stage,
  });
}
