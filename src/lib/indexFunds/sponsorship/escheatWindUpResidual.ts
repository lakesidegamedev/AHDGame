/**
 * Wind-up cash whose owner no longer exists.
 *
 * A winding-down fund can still carry positions keyed to a holder record that
 * is gone (a dissolved corporation, a retired character), and its sponsor
 * corporation may itself have been dissolved. Those claims cannot be paid to
 * anyone, but the money is real: the fund still holds it. This codebase's
 * convention for unowned money is escheat to the country's central bank
 * reserve (bug #0540, the public-float slice of a dissolved corporation), not
 * destruction. A global fund has no `countryId`, so the destination is the
 * bank that backs its anchor currency.
 */
import { ObjectId, type Db } from "mongodb";
import { getBankId } from "@/lib/centralBank/helpers";
import { resolveCentralBankCurrency } from "@/lib/centralBank/currencyRouting";
import { loadFxRatesRecord } from "@/lib/currency/corporationCapital";
import { writeGovBudgetLocal } from "@/lib/currency/govBudgetFields";
import type { CountryId } from "@/lib/constants/countries";
import type { CentralBank } from "@/lib/db/types";
import type { IndexFund, IndexFundTransaction } from "@/lib/db/types/indexFund";
import { emitTx } from "@/lib/financialTxLog/emit";

/**
 * Credit `amountAnchor` to the central bank reserve backing the fund's anchor
 * currency, record the fund-side transaction and emit the money witness.
 * Returns the amount booked in the reserve's local currency.
 */
export async function escheatWindUpResidual(
  db: Db,
  fund: IndexFund,
  amountAnchor: number,
  currentTurn: number,
  now: Date,
  forexEnabled: boolean
): Promise<number> {
  if (!Number.isFinite(amountAnchor) || amountAnchor <= 0) return 0;

  const countryId =
    fund.countryId ?? resolveCentralBankCurrency(fund.anchorCurrencyCode)?.anchorCountryId;
  if (!countryId) return 0;
  const anchorCountryId = countryId as CountryId;
  const bankId = getBankId(anchorCountryId);
  const rates = forexEnabled ? await loadFxRatesRecord(db) : {};
  const rate = forexEnabled ? (rates[fund.anchorCurrencyCode] ?? 1) : 1;
  const localAmount =
    Math.round(writeGovBudgetLocal(amountAnchor, fund.anchorCurrencyCode, rate) * 100) / 100;
  if (!Number.isFinite(localAmount) || localAmount <= 0) return 0;

  const credited = await db
    .collection<CentralBank>("centralBanks")
    .updateOne(
      { _id: bankId },
      { $inc: { reserveBalance: localAmount }, $set: { updatedAt: now } }
    );
  if (!credited.matchedCount) return 0;

  const witness = await emitTx(db, {
    type: "index_fund_redeem",
    turn: currentTurn,
    createdAt: now,
    subjectType: "government",
    countryId: anchorCountryId,
    subjectName: `${bankId} central bank reserve`,
    amount: localAmount,
    currencyCode: fund.anchorCurrencyCode,
    counterpartyType: "system",
    counterpartyName: fund.name,
    meta: {
      kind: "wind_up_escheat",
      fundId: fund._id.toString(),
      tickerSymbol: fund.tickerSymbol,
      unclaimedAnchor: Math.round(amountAnchor * 100) / 100,
      centralBankId: bankId,
    },
  });
  if (witness === "failed") throw new Error("Fund escheat witness failed");

  await db.collection<IndexFundTransaction>("indexFundTransactions").insertOne({
    _id: new ObjectId(),
    fundId: fund._id,
    kind: "wind_up_escheat",
    turn: currentTurn,
    amountAnchor: Math.round(amountAnchor * 100) / 100,
    note: `Wind-up residual with no surviving owner escheated to ${bankId} central bank reserve`,
    createdAt: now,
  } as IndexFundTransaction);

  return localAmount;
}
