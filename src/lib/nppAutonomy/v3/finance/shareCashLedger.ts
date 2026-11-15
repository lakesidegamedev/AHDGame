import type { Db } from "mongodb";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import type { NPP } from "@/lib/db/types";
import type { LedgerEntryInput } from "@/lib/ledger/types";
import { currentBondPoolLedgerContext } from "@/lib/bonds/marketPoolLedger";
import { emitLedgerEntries } from "@/lib/ledger/emit";
import { nppShareCashLegs } from "./rules/shareCashLedger";

/** Reuse the investment phase batch; NPP cash is already anchor-denominated. */
export async function witnessNppShareCash(
  db: Db,
  npp: Pick<NPP, "_id" | "countryId">,
  amountAnchor: number,
  now: Date
): Promise<void> {
  return witnessNppInvestmentCash(db, npp, amountAnchor, now, {
    txType: amountAnchor < 0 ? "stock_trade_buy" : "stock_trade_sell",
    emitSite: "nppAutonomy/shareCashLedger",
    reason: "equity_transfer",
  });
}

export async function witnessNppFoundingCash(
  db: Db,
  npp: Pick<NPP, "_id" | "countryId">,
  feeAnchor: number,
  now: Date
): Promise<void> {
  return witnessNppInvestmentCash(db, npp, -feeAnchor, now, {
    txType: "corp_capital_seed",
    emitSite: "nppAutonomy/foundingCashLedger",
    reason: "corporation_founding_fee",
  });
}

async function witnessNppInvestmentCash(
  db: Db,
  npp: Pick<NPP, "_id" | "countryId">,
  amountAnchor: number,
  now: Date,
  accounting: {
    txType: LedgerEntryInput["txType"];
    emitSite: string;
    reason: "equity_transfer" | "corporation_founding_fee";
  }
): Promise<void> {
  if (amountAnchor === 0) return;
  const context = await currentBondPoolLedgerContext(db);
  if (!context) return;
  const entry: LedgerEntryInput = {
    turn: context.turn,
    createdAt: now,
    txType: accounting.txType,
    emitSite: accounting.emitSite,
    legs: nppShareCashLegs(
      npp._id.toHexString(),
      COUNTRY_CURRENCY_MAP[npp.countryId ?? "US"] ?? "USD",
      amountAnchor,
      accounting.reason
    ),
  };
  if (context.pendingEntries) context.pendingEntries.push(entry);
  else await emitLedgerEntries(db, [entry]);
}
