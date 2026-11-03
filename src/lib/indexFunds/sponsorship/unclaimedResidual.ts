/**
 * A fund can outlive the corporation that sponsored it or held units in it:
 * corporation deletion neither clears index-fund positions nor ends a fund it
 * sponsors. Wind-up must not freeze forever on the dangling id, so unowned fund
 * cash follows the rule the game already applies to unowned equity in a
 * corporation dissolution — it escheats to the country's central bank reserve
 * with a government ledger row (see the dissolve route's publicFloat branch).
 */
import type { Db, ObjectId } from "mongodb";
import { getBankId } from "@/lib/centralBank/helpers";
import type { CountryId } from "@/lib/constants/countries";
import { COUNTRY_CURRENCY_MAP, CURRENCY_ANCHOR_COUNTRY } from "@/lib/constants/currencyCodes";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CentralBank } from "@/lib/db/types/centralBank";
import type { IndexFund } from "@/lib/db/types/indexFund";
import { loadFxRatesRecord } from "@/lib/currency/corporationCapital";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { writeGovBudgetLocal } from "@/lib/currency/govBudgetFields";
import { emitTx } from "@/lib/financialTxLog/emit";

export type UnclaimedFundReason = "sponsor_missing" | "corporate_holder_missing";

export interface UnclaimedFundDestination {
  countryId: CountryId;
  currencyCode: CurrencyCode;
  amountLocal: number;
}

/**
 * Credit unowned wind-up cash to the fund country's central bank reserve and
 * write the government ledger row. Returns null when there is nothing to move,
 * so a zero-value dangling holding never blocks the delist.
 */
export async function escheatUnclaimedFundCash(
  db: Db,
  fund: IndexFund,
  amountAnchor: number,
  turn: number,
  now: Date,
  reason: UnclaimedFundReason,
  detail: { corporationId?: ObjectId } = {}
): Promise<UnclaimedFundDestination | null> {
  if (!(amountAnchor > 0)) return null;

  // Global funds carry no countryId; their anchor currency's home country is
  // the reserve that would hold the same unowned cash.
  const countryId = fund.countryId ?? CURRENCY_ANCHOR_COUNTRY[fund.anchorCurrencyCode];
  const currencyCode = COUNTRY_CURRENCY_MAP[countryId] ?? fund.anchorCurrencyCode;

  const forex = await isForexEnabled();
  const rates = forex ? await loadFxRatesRecord(db) : {};
  // Matches the dissolution route: a missing rate falls back to passthrough
  // rather than freezing the wind-up.
  const fxRate = forex ? (rates[currencyCode] ?? 1) : 1;
  const amountLocal = writeGovBudgetLocal(amountAnchor, currencyCode, fxRate);
  if (!(amountLocal > 0)) return null;

  const bankId = getBankId(countryId);
  await db
    .collection<CentralBank>("centralBanks")
    .updateOne(
      { _id: bankId },
      { $inc: { reserveBalance: amountLocal }, $set: { updatedAt: now } }
    );

  await emitTx(db, {
    type: "corp_dissolution_distribution",
    turn,
    createdAt: now,
    subjectType: "government",
    countryId,
    subjectName: `${bankId} central bank reserve`,
    amount: Math.round(amountLocal * 100) / 100,
    currencyCode,
    counterpartyType: "system",
    counterpartyName: fund.name,
    meta: {
      side: "publicFloat",
      reason,
      fundId: fund._id.toString(),
      fundTicker: fund.tickerSymbol,
      centralBankId: bankId,
      escheatedAnchor: Math.round(amountAnchor * 100) / 100,
      ...(detail.corporationId
        ? { missingHolderCorporationId: detail.corporationId.toString() }
        : {}),
    },
  });

  return { countryId, currencyCode, amountLocal };
}
