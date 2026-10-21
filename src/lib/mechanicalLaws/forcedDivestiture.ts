/**
 * Forced sale under the Subsidiary Limits and Foreign Investment Acts: when a
 * group misses its compliance deadline, its controlling stake in the
 * subsidiary is sold down to half at book value into the equity market.
 *
 * Money moves pool to seller and shares move seller to float, the same two
 * legs as a player selling into the float (commands/shareTrading/
 * sellPublicShares), with the pool as the only payer so the subsidiary's own
 * treasury never funds its group's exit. The pool debit is gated: if the pool
 * cannot cover the stake this turn, nothing moves and the order stands.
 */
import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  debitEquityPoolGated,
  readEquityPool,
  refundEquityPoolDebit,
} from "@/lib/equities/marketPool";
import { debitSharesFromCorp } from "@/lib/corporations/shareholderOps";
import {
  anchorToCorpLiquidCapital,
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { emitTx } from "@/lib/financialTxLog/emit";
import { sharesToDropControl } from "./enforcementRules";

export type ForcedSaleOutcome =
  | { status: "sold"; shares: number; proceedsAnchor: number }
  | { status: "noControl" }
  | { status: "deferred"; why: "poolShort" | "sharesMoved" }
  | { status: "refused"; why: "noPool" | "noPrice" };

/** Book value of one share, in anchor units: the holder's cost, else fundamental. */
export function bookValuePerShareAnchor(
  holding: { avgCostPerShare?: number; avgCostBasisUnit?: "anchor" },
  target: Pick<Corporation, "fundamentalSharePrice">,
  targetFxRate: number
): number {
  if (holding.avgCostBasisUnit === "anchor" && (holding.avgCostPerShare ?? 0) > 0) {
    return holding.avgCostPerShare!;
  }
  const local = target.fundamentalSharePrice ?? 0;
  return local > 0 && targetFxRate > 0 ? local / targetFxRate : 0;
}

export async function executeForcedDivestiture(
  db: Db,
  args: {
    target: Corporation;
    parent: Corporation;
    exchangeRatesByCurrency: ReadonlyMap<CurrencyCode, number>;
    turn: number;
    now: Date;
  }
): Promise<ForcedSaleOutcome> {
  const { target, parent, exchangeRatesByCurrency, turn, now } = args;
  const holding = target.shareholders?.find((s) => s.corporationId?.equals(parent._id));
  const shares = holding ? sharesToDropControl(target.totalShares ?? 0, holding.shares) : 0;
  if (!holding || shares <= 0) return { status: "noControl" };

  const targetFx = fxRateForCorpFromMap(
    target,
    exchangeRatesByCurrency as Map<CurrencyCode, number>
  );
  const perShareAnchor = bookValuePerShareAnchor(holding, target, targetFx);
  if (!(perShareAnchor > 0)) return { status: "refused", why: "noPrice" };
  const proceedsAnchor = Math.round(shares * perShareAnchor * 100) / 100;

  const currency = (resolveCorpLiquidCurrencyCode(target) ?? "USD") as CurrencyCode;
  if (!(await readEquityPool(db, currency))) return { status: "refused", why: "noPool" };
  const proceedsLocal = anchorToCorpLiquidCapital(proceedsAnchor, target, targetFx);
  const debit = await debitEquityPoolGated(db, currency, proceedsLocal, "salesOut", now);
  if (!debit.ok) return { status: "deferred", why: "poolShort" };

  const remaining = await debitSharesFromCorp(
    db,
    target._id,
    parent._id,
    shares,
    { $inc: { publicFloat: shares }, $set: { updatedAt: now } },
    { requireSufficient: true }
  );
  if (remaining < 0) {
    await refundEquityPoolDebit(db, currency, proceedsLocal, "salesOut", now);
    return { status: "deferred", why: "sharesMoved" };
  }

  const parentFx = fxRateForCorpFromMap(
    parent,
    exchangeRatesByCurrency as Map<CurrencyCode, number>
  );
  const credit = anchorToCorpLiquidCapital(proceedsAnchor, parent, parentFx);
  await db
    .collection<Corporation>("corporations")
    .updateOne({ _id: parent._id }, { $inc: { liquidCapital: credit }, $set: { updatedAt: now } });

  void emitTx(db, {
    type: "stock_trade_sell",
    turn,
    createdAt: now,
    subjectType: "corporation",
    subjectId: parent._id,
    subjectName: parent.name,
    amount: credit,
    currencyCode: resolveCorpLiquidCurrencyCode(parent) ?? "USD",
    counterpartyType: "corporation",
    counterpartyId: target._id,
    counterpartyName: target.name,
    meta: {
      corporationId: target._id.toString(),
      shares,
      pricePerShareAnchor: perShareAnchor,
      forcedDivestiture: true,
    },
  });
  return { status: "sold", shares, proceedsAnchor };
}
