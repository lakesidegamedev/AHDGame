import type { Db, ObjectId } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { emitTx } from "@/lib/financialTxLog/emit";

/**
 * Finance-history row for a sector strategy change fee.
 *
 * Retooling a sector (25% of its daily revenue) and cancelling a retool in
 * flight both debit `liquidCapital` directly; without a ledger row the cash
 * vanishes from finance history and the reconciler flags an unexplained
 * divergence.
 *
 * Call after the guarded cash write has applied; `emitTx` never throws.
 */
export interface SectorRetoolTxInput {
  corporationId: ObjectId;
  corporationName: string;
  corporationSequentialId?: number;
  /** Magnitude debited from `liquidCapital`, in `currencyCode`. Non-positive amounts emit nothing. */
  amountLocal: number;
  currencyCode: CurrencyCode;
  turn: number;
  createdAt: Date;
  action: "retool" | "cancel_retool";
  sectorId: ObjectId;
  sectorType: string;
  fromStrategyId?: string | null;
  toStrategyId?: string | null;
}

export async function emitSectorRetoolTx(db: Db, input: SectorRetoolTxInput): Promise<void> {
  if (!Number.isFinite(input.amountLocal) || input.amountLocal <= 0) return;
  await emitTx(db, {
    type: "corp_sector_retool",
    turn: input.turn,
    createdAt: input.createdAt,
    subjectType: "corporation",
    subjectId: input.corporationId,
    subjectName: input.corporationName,
    ...(input.corporationSequentialId !== undefined
      ? { subjectSequentialId: input.corporationSequentialId }
      : {}),
    amount: -input.amountLocal,
    currencyCode: input.currencyCode,
    meta: {
      action: input.action,
      sectorId: input.sectorId.toString(),
      sectorType: input.sectorType,
      ...(input.fromStrategyId ? { fromStrategyId: input.fromStrategyId } : {}),
      ...(input.toStrategyId ? { toStrategyId: input.toStrategyId } : {}),
    },
  });
}
