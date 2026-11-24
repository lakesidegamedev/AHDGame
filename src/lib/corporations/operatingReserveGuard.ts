/**
 * Operating reserve reads and the corporate share-market purchase guard.
 *
 * A company's running bills come from each plant's last settled receipt
 * (rules/operatingReserve.ts). Capacity builds and every purchase a company
 * makes with its own cash on the share market are held to the same reserve:
 * spending into it needs the CEO's explicit confirm, and spending past the
 * cash on hand is always refused.
 */
import type { Db, ObjectId } from "mongodb";
import type { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/errors";
import type { Corporation } from "@/lib/db/types";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import {
  anchorToCorpLiquidCapital,
  getCorpFxRate,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import {
  OPERATING_RESERVE_TURNS,
  operatingReserveMessage,
  purchaseOverCashMessage,
  purchaseReserveVerdict,
  runningFlowsPerTurn,
  type ReserveReceipt,
} from "@/lib/corporations/rules/operatingReserve";
import { getCurrentTurn } from "@/lib/turn/currentTurn";

/** The operating reserve a cash spend is held to, in the corporation's currency. */
export interface OperatingReserveQuote {
  reserveTurns: number;
  operatingReserveLocal: number;
  maxAffordableLocal: number;
}

/** Turns of running bills to keep (gameConfig capacityBuildReserveTurns; absent = default, 0 = off). */
export async function loadOperatingReserveTurns(db: Db): Promise<number> {
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { capacityBuildReserveTurns: 1 } }
  );
  const configured = config?.capacityBuildReserveTurns;
  return typeof configured === "number" && Number.isFinite(configured) && configured >= 0
    ? configured
    : OPERATING_RESERVE_TURNS;
}

/** Only the settled receipt lines the reserve reads. */
export const RESERVE_RECEIPT_PROJECTION = {
  corporationId: 1,
  "producerSettlement.turn": 1,
  "producerSettlement.labourPaid": 1,
  "producerSettlement.labourArrears": 1,
  "producerSettlement.otherOperatingPaid": 1,
  "producerSettlement.otherOperatingArrears": 1,
  "producerSettlement.purchases": 1,
  "producerSettlement.revenue": 1,
  "producerSettlement.internalSupplyIncome": 1,
  "producerSettlement.activeUnits": 1,
  "producerSettlement.producedUnits": 1,
  "producerSettlement.plannedRunShare": 1,
  "producerSettlement.runCutBy": 1,
} as const;

/**
 * Turns of running bills a cash spend must leave and the company's running
 * bills and sales per turn in anchor, read from each plant's last settled
 * receipt. Projected: only the receipt lines the reserve reads.
 */
export async function loadOperatingReserve(
  db: Db,
  corporationId: ObjectId,
  currentTurn: number,
  turnsOverride?: number
): Promise<{ turns: number; billsPerTurnAnchor: number; revenuePerTurnAnchor: number }> {
  const turns = turnsOverride ?? (await loadOperatingReserveTurns(db));
  if (!(turns > 0)) return { turns: 0, billsPerTurnAnchor: 0, revenuePerTurnAnchor: 0 };
  const sectors = await corporateSectorsCollection(db)
    .find({ corporationId }, { projection: RESERVE_RECEIPT_PROJECTION })
    .toArray();
  const receipts: ReserveReceipt[] = sectors.flatMap((s) =>
    s.producerSettlement ? [s.producerSettlement] : []
  );
  const flows = runningFlowsPerTurn(receipts, currentTurn);
  return { turns, billsPerTurnAnchor: flows.bills, revenuePerTurnAnchor: flows.revenue };
}

/** Why a corporate share-market purchase was refused. */
export type CorpPurchaseReserveRefusal = {
  ok: false;
  status: number;
  code: "insufficient_cash" | "operating_reserve";
  error: string;
  reserve?: OperatingReserveQuote;
};

export type CorpPurchaseReserveResult = { ok: true } | CorpPurchaseReserveRefusal;

/**
 * Check one purchase a company pays for from its own cash on the share market.
 * `costLocal` is what leaves the company's cash, in its own currency.
 * `cashInLocal` is cash the same action brings in (a takeover absorbs the
 * target's cash); `extraCorporationIds` are companies whose plants become this
 * company's plants in the same action, so their bills join the reserve.
 */
export async function checkCorpPurchaseReserve(
  db: Db,
  input: {
    corporation: Pick<Corporation, "_id" | "liquidCapital" | "liquidCurrencyCode"> &
      Partial<Corporation>;
    costLocal: number;
    confirmed?: boolean;
    cashInLocal?: number;
    extraCorporationIds?: readonly ObjectId[];
  }
): Promise<CorpPurchaseReserveResult> {
  const { corporation } = input;
  const cashLocal = corporation.liquidCapital ?? 0;
  const cashInLocal = Math.max(0, input.cashInLocal ?? 0);
  const netCostLocal = Math.max(0, input.costLocal - cashInLocal);
  const currencyCode = resolveCorpLiquidCurrencyCode(corporation);
  // Over the cash on hand: refused whatever the confirm says.
  if (input.costLocal > cashLocal + cashInLocal + 1e-6) {
    return {
      ok: false,
      status: 400,
      code: "insufficient_cash",
      error: purchaseOverCashMessage({ costLocal: input.costLocal, cashLocal, currencyCode }),
    };
  }
  const turns = await loadOperatingReserveTurns(db);
  if (!(turns > 0)) return { ok: true };
  const currentTurn = await getCurrentTurn(db);
  const ids = [corporation._id, ...(input.extraCorporationIds ?? [])];
  const sectors = await corporateSectorsCollection(db)
    .find(ids.length === 1 ? { corporationId: ids[0] } : { corporationId: { $in: ids } }, {
      projection: RESERVE_RECEIPT_PROJECTION,
    })
    .toArray();
  const billsAnchor = runningFlowsPerTurn(
    sectors.flatMap((s) => (s.producerSettlement ? [s.producerSettlement] : [])),
    currentTurn
  ).bills;
  if (!(billsAnchor > 0)) return { ok: true };
  const fxRate = await getCorpFxRate(db, corporation);
  const billsLocal = anchorToCorpLiquidCapital(billsAnchor, corporation, fxRate);
  const verdict = purchaseReserveVerdict({
    cash: cashLocal,
    cost: netCostLocal,
    billsPerTurn: billsLocal,
    turns,
    confirmed: input.confirmed === true,
  });
  if (verdict.kind === "ok") return { ok: true };
  if (verdict.kind === "over_cash")
    return {
      ok: false,
      status: 400,
      code: "insufficient_cash",
      error: purchaseOverCashMessage({ costLocal: input.costLocal, cashLocal, currencyCode }),
    };
  const reserve: OperatingReserveQuote = {
    reserveTurns: turns,
    operatingReserveLocal: Math.round(verdict.check.reserve),
    maxAffordableLocal: Math.floor(verdict.check.maxAffordable),
  };
  return {
    ok: false,
    status: 409,
    code: "operating_reserve",
    error: operatingReserveMessage({
      costLocal: netCostLocal,
      cashLocal,
      reserveLocal: reserve.operatingReserveLocal,
      maxAffordableLocal: reserve.maxAffordableLocal,
      turns,
      currencyCode,
      spend: "purchase",
    }),
    reserve,
  };
}

/** The HTTP response for a refused purchase; the reserve refusal carries its figures. */
export function corpPurchaseReserveResponse(refusal: CorpPurchaseReserveRefusal): NextResponse {
  return refusal.code === "operating_reserve"
    ? errorResponse(refusal.status, refusal.error, {
        code: "OPERATING_RESERVE_SHORT",
        extra: { ...refusal.reserve, requiresOperatingReserveConfirm: true },
      })
    : errorResponse(refusal.status, refusal.error);
}
