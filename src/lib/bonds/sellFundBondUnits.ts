import { isForexEnabled } from "@/lib/currency/featureFlag";
/**
 * Sell an index fund's bond holdings to the market pool for cash.
 *
 * Used when a fund owes redemptions it cannot pay from cash. Each holding is
 * sold at the pool's bid, largest position first, only as far as the pool can
 * pay (gated debit). Units go back to the pool (`publicFloat`), cash lands on
 * the fund in anchor terms. Nothing is minted: a pool with no cash buys
 * nothing and the redemption waits.
 */

import { ObjectId, type Db, type UpdateFilter } from "mongodb";
import { createHash } from "node:crypto";
import { withSessionDb } from "@/lib/db/sessionDb";
import { indexFundTransactionsCollection } from "@/lib/db/repositories/indexFundTransactions";
import type { Bond, IndexFund } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { corpCapitalToAnchor, loadFxRatesRecord } from "@/lib/currency/corporationCapital";
import { bondPoolCurrency, debitBondPoolGated, loadBondQuote } from "@/lib/bonds/marketPool";
import { emitTx, loadTxThresholds } from "@/lib/financialTxLog/emit";
import type { TxThresholds } from "@/lib/db/types/financialTxLog";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import type { Document } from "mongodb";

export interface SellFundBondsResult {
  proceedsAnchor: number;
  unitsSold: number;
  bondsTouched: number;
}

function fxFor(rates: Record<string, number>, currency: CurrencyCode): number | null {
  const rate = rates[currency];
  return Number.isFinite(rate) && rate! > 0 ? rate! : null;
}

export async function sellFundBondHoldingsForCash(
  db: Db,
  fund: Pick<IndexFund, "_id" | "name" | "quotedNav" | "anchorCurrencyCode">,
  neededAnchor: number,
  now: Date = new Date(),
  options?: {
    /**
     * Game turn stamped on each fund-subject ledger row.
     * When absent the sales still settle but emit no rows.
     */
    turn?: number;
    operationKey?: string;
    /** Preloaded thresholds shared by every sale row in the pass. */
    thresholds?: TxThresholds;
  }
): Promise<SellFundBondsResult> {
  const result: SellFundBondsResult = { proceedsAnchor: 0, unitsSold: 0, bondsTouched: 0 };
  if (!(neededAnchor > 0)) return result;

  const bonds = await bondsCollection(db)
    .find({
      matured: false,
      defaulted: { $ne: true },
      holders: { $elemMatch: { fundId: fund._id } },
    })
    .toArray();
  if (bonds.length === 0) return result;

  const forexEnabled = await isForexEnabled();
  const fxRates = forexEnabled ? await loadFxRatesRecord(db) : {};
  const positions = bonds
    .map((bond) => ({
      bond,
      units: bond.holders.find((h) => h.fundId?.toString() === fund._id.toString())?.units ?? 0,
    }))
    .filter((row) => row.units > 0)
    .sort((a, b) => b.units * b.bond.marketPrice - a.units * a.bond.marketPrice);

  // One thresholds read for the whole sale pass; every row below shares it.
  const thresholds =
    options?.turn !== undefined ? (options?.thresholds ?? (await loadTxThresholds(db))) : undefined;

  let remainingAnchor = neededAnchor;
  for (const { bond, units: held } of positions) {
    if (remainingAnchor <= 0) break;
    const currency = bondPoolCurrency(bond);
    const rate = forexEnabled ? fxFor(fxRates, currency) : 1;
    if (rate == null) continue;
    const quote = await loadBondQuote(db, bond);
    if (!(quote.bidPerUnit > 0)) continue;
    const neededLocal = remainingAnchor * rate;
    const wantUnits = Math.min(held, Math.ceil(neededLocal / quote.bidPerUnit));
    const units = Math.min(wantUnits, quote.depthUnitsAtBid);
    if (units <= 0) continue;
    const proceedsLocal = Math.round(units * quote.bidPerUnit * 100) / 100;

    const receiptId = new ObjectId(
      createHash("sha256")
        .update(
          `fund-bond-sale:${fund._id}:${bond._id}:${options?.operationKey ?? `${options?.turn ?? now.getTime()}:${neededAnchor}`}`
        )
        .digest("hex")
        .slice(0, 24)
    );
    const ledgerId = new ObjectId(
      createHash("sha256").update(`ledger:${receiptId}`).digest("hex").slice(0, 24)
    );
    const proceedsAnchor = corpCapitalToAnchor(proceedsLocal, currency, rate);
    let sale: { proceedsAnchor: number; units: number } | null;
    try {
      sale = await withSessionDb(db, async (tx) => {
        const receipts = indexFundTransactionsCollection(tx);
        const prior = await receipts.findOne({ _id: receiptId });
        if (prior) return { proceedsAnchor: prior.amountAnchor ?? 0, units: prior.units ?? 0 };
        // A holding and the pool's bid cash cannot disappear without the fund's proceeds.
        const current = await bondsCollection(tx).findOne(
          {
            _id: bond._id,
            matured: false,
            defaulted: { $ne: true },
            sovereignMaturityClaim: { $exists: false },
            holders: { $elemMatch: { fundId: fund._id, units: { $gte: units } } },
          },
          { projection: { _id: 1 } }
        );
        if (!current) return null;
        const debit = await debitBondPoolGated(tx, currency, proceedsLocal, "salesOut", now);
        if (!debit.ok) return null;
        const released = await bondsCollection(tx).updateOne(
          { _id: bond._id, holders: { $elemMatch: { fundId: fund._id, units: { $gte: units } } } },
          { $inc: { "holders.$.units": -units, publicFloat: units }, $set: { updatedAt: now } }
        );
        if (released.modifiedCount !== 1) throw new Error("Bond position changed during sale");
        await bondsCollection(tx).updateOne({ _id: bond._id }, {
          $pull: { holders: { fundId: fund._id, units: { $lte: 0 } } },
        } as unknown as UpdateFilter<Bond>);
        const paid = await indexFundsCollection<Document>(tx).updateOne(
          { _id: fund._id },
          { $inc: { cashAnchor: proceedsAnchor }, $set: { updatedAt: now } }
        );
        if (paid.matchedCount !== 1) throw new Error("Fund disappeared during bond sale");
        await receipts.insertOne({
          _id: receiptId,
          fundId: fund._id,
          kind: "bond_sale",
          units,
          amountAnchor: proceedsAnchor,
          navAnchor: fund.quotedNav,
          note: `Sold ${units} bond units (${bond.issuerName ?? "bond"}) to the market for liquidity`,
          createdAt: now,
        });
        if (options?.turn !== undefined) {
          const emitted = await emitTx(
            tx,
            {
              type: "bond_sell",
              turn: options.turn,
              createdAt: now,
              subjectType: "fund",
              subjectId: fund._id,
              subjectName: fund.name,
              amount: proceedsAnchor,
              anchorAmount: proceedsAnchor,
              currencyCode: fund.anchorCurrencyCode,
              counterpartyType: "system",
              counterpartyName: bond.issuerName ?? "Bond market",
              meta: {
                bondId: bond._id.toString(),
                units,
                pricePerUnit: quote.bidPerUnit,
                source: "redemption-liquidity",
              },
            },
            thresholds,
            { _id: ledgerId }
          );
          if (emitted === "failed") throw new Error("Bond sale witness could not commit");
        }
        return { proceedsAnchor, units };
      });
    } catch (error) {
      // Standalone worlds retain their holdings and let the redemption wait.
      const code = (error as { code?: number })?.code;
      if (code === 20 || code === 263 || code === 303) continue;
      throw error;
    }
    if (!sale) continue;
    remainingAnchor -= sale.proceedsAnchor;
    result.proceedsAnchor += sale.proceedsAnchor;
    result.unitsSold += sale.units;
    result.bondsTouched++;
  }
  return result;
}
