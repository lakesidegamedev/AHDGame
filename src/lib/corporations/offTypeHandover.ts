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
 * advanced pending -> debited -> moved -> done. A retry resumes from the
 * recorded leg, so no debit, credit, transfer or ledger row repeats.
 */
import type { Db, ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import { isNppOwned } from "@/lib/corporations/nppOwned";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";
import { getControllingCorporateParent } from "@/lib/corporations/corporateOwnership";
import { getSectorTypeMatchModifier } from "@/lib/corporations/specialization/rules";
import { hasProtectedConstructionProperty } from "@/lib/corporations/securedConstructionProperty";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { moveSectorToCorp } from "@/lib/corporations/moveSector";
import { sectorBookValueAnchor } from "@/lib/corporations/sectorProfitBasis";
import {
  anchorToCorpLiquidCapital,
  getCorpFxRate,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import {
  atomicallyDebitCorpLiquidCapital,
  creditCorpLiquidCapital,
} from "@/lib/financialTxLog/atomicCashGuard";
import { emitTx } from "@/lib/financialTxLog/emit";
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
  const sectors = await sectorsCol
    .find({ corporationId: { $in: corps.map((c) => c._id) } })
    .toArray();

  const [contractSectorIds, activeAgreements] = await Promise.all([
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
  ]);
  const contracted = new Set(contractSectorIds.map((id) => String(id)));
  const agreementKeys = new Set(activeAgreements.map((a) => `${a.supplierCorpId}|${a.commodity}`));

  const ownedLanes = new Set(
    sectors.map(
      (s) =>
        `${s.corporationId}|${s.stateId}|${s.sectorType}|${s.industryModel ?? ""}|${s.mediaDiscriminator ?? ""}`
    )
  );
  const capacityByCorpType = new Map<string, number>();
  for (const s of sectors) {
    const k = `${s.corporationId}|${s.sectorType}`;
    capacityByCorpType.set(k, (capacityByCorpType.get(k) ?? 0) + (Number(s.capitalStock) || 0));
  }

  const bySeller = new Map<string, CorporateSector[]>();
  for (const s of sectors) {
    const seller = corpById.get(s.corporationId.toString());
    if (!seller || !isOffType(seller, s.sectorType)) continue;
    if (s.sectorType === "extraction" || hasProtectedConstructionProperty(s)) continue;
    if (contracted.has(s._id.toString())) continue;
    const outputs = Object.keys(s.soldByCommodity ?? {});
    if (outputs.some((c) => agreementKeys.has(`${s.corporationId}|${c}`))) continue;
    const list = bySeller.get(s.corporationId.toString()) ?? [];
    list.push(s);
    bySeller.set(s.corporationId.toString(), list);
  }

  const buyersUsed = new Set<string>();
  for (const [sellerId, rows] of bySeller) {
    const seller = corpById.get(sellerId)!;
    const sector = pickHandoverSector(rows);
    if (!sector) continue;
    const key = `${args.turn}:${sector._id.toString()}`;
    const prior = await receipts.findOne({ _id: key });
    if (prior && (prior.state === "done" || prior.state === "deferred" || prior.state === "failed"))
      continue;

    const sellerCurrency = resolveCorpLiquidCurrencyCode(seller);
    const buyer = prior
      ? (corpById.get(prior.buyerId.toString()) ?? null)
      : (corps
          .filter(
            (c) =>
              !c._id.equals(seller._id) &&
              !buyersUsed.has(c._id.toString()) &&
              c.countryId === seller.countryId &&
              isSameType(c, sector.sectorType) &&
              resolveCorpLiquidCurrencyCode(c) === sellerCurrency &&
              !ownedLanes.has(
                `${c._id}|${sector.stateId}|${sector.sectorType}|${sector.industryModel ?? ""}|${sector.mediaDiscriminator ?? ""}`
              )
          )
          .sort(
            (a, b) =>
              (capacityByCorpType.get(`${a._id}|${sector.sectorType}`) ?? 0) -
                (capacityByCorpType.get(`${b._id}|${sector.sectorType}`) ?? 0) ||
              a._id.toString().localeCompare(b._id.toString())
          )[0] ?? null);
    if (!buyer) {
      out.deferred++;
      continue;
    }

    const priceAnchor =
      prior?.priceAnchor ??
      Math.max(
        0,
        sectorBookValueAnchor(sector as never, args.year, args.eraUnitScale, args.turn) +
          Math.max(0, Number(sector.inventoryValueAnchor) || 0)
      );
    const fx = await getCorpFxRate(db, buyer);
    const priceLocal =
      prior?.priceLocal ?? Math.round(anchorToCorpLiquidCapital(priceAnchor, buyer, fx));
    if (!(priceLocal > 0)) {
      out.deferred++;
      continue;
    }
    if (!prior) {
      try {
        await receipts.insertOne({
          _id: key,
          turn: args.turn,
          sectorId: sector._id,
          sellerId: seller._id,
          buyerId: buyer._id,
          priceAnchor,
          priceLocal,
          currency: sellerCurrency ?? "USD",
          state: "pending",
          at: new Date(),
        });
      } catch {
        continue; // another run owns this key
      }
    }
    let state = prior?.state ?? "pending";

    if (state === "pending") {
      const debit = await atomicallyDebitCorpLiquidCapital(db, buyer._id, priceLocal);
      if (!debit.ok) {
        await receipts.updateOne(
          { _id: key },
          { $set: { state: "deferred", reason: debit.error } }
        );
        out.deferred++;
        continue;
      }
      await receipts.updateOne({ _id: key }, { $set: { state: "debited" } });
      state = "debited";
    }
    if (state === "debited") {
      const live = await sectorsCol.findOne({ _id: sector._id });
      if (live && live.corporationId.equals(seller._id)) {
        try {
          await moveSectorToCorp(
            db,
            live,
            buyer._id,
            sellerCurrency,
            fx,
            sellerCurrency,
            fx,
            new Date()
          );
        } catch (error) {
          await creditCorpLiquidCapital(db, buyer._id, priceLocal);
          await receipts.updateOne(
            { _id: key },
            {
              $set: {
                state: "failed",
                reason: error instanceof Error ? error.message : String(error),
              },
            }
          );
          out.deferred++;
          continue;
        }
      }
      await receipts.updateOne({ _id: key }, { $set: { state: "moved" } });
      state = "moved";
    }
    if (state === "moved") {
      await creditCorpLiquidCapital(db, seller._id, priceLocal);
      await receipts.updateOne({ _id: key }, { $set: { state: "done" } });
      const now = new Date();
      const meta = {
        kind: "off_type_handover",
        sectorId: sector._id.toString(),
        sectorType: sector.sectorType,
        stateId: sector.stateId,
        priceAnchor,
      };
      await Promise.all([
        emitTx(db, {
          type: "corp_sector_purchase",
          turn: args.turn,
          createdAt: now,
          subjectType: "corporation",
          subjectId: buyer._id,
          subjectName: buyer.name,
          amount: -priceLocal,
          currencyCode: sellerCurrency ?? "USD",
          counterpartyType: "corporation",
          counterpartyId: seller._id,
          counterpartyName: seller.name,
          meta,
        }),
        emitTx(db, {
          type: "corp_sector_sale",
          turn: args.turn,
          createdAt: now,
          subjectType: "corporation",
          subjectId: seller._id,
          subjectName: seller.name,
          amount: priceLocal,
          currencyCode: sellerCurrency ?? "USD",
          counterpartyType: "corporation",
          counterpartyId: buyer._id,
          counterpartyName: buyer.name,
          meta,
        }),
      ]);
      buyersUsed.add(buyer._id.toString());
      ownedLanes.add(
        `${buyer._id}|${sector.stateId}|${sector.sectorType}|${sector.industryModel ?? ""}|${sector.mediaDiscriminator ?? ""}`
      );
      out.moved++;
    }
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
