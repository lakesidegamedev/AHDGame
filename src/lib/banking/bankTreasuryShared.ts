/** Types and small helpers shared by bank treasury trading and its receipt state machine. */
import type { Corporation } from "@/lib/db/types/corporation";
import { type CurrencyCode, getCountryIdForCurrency } from "@/lib/constants/currencies";
import {
  computeBankTreasuryCashFloor,
  bankTreasuryHolderUnits,
  computeBankTreasuryDueInterest,
  computeBankTreasuryFundingRatePercent,
} from "@/lib/banking/rules/bankTreasury";
import { roundSavingsAmount } from "@/lib/currency/savingsInterest";
import type { BondHolder } from "@/lib/db/types/bond";
import type {
  BankTreasuryHolderSnapshot,
  BankTreasuryTradeReceipt,
  BankCharter,
  InterbankLoan,
} from "@/lib/db/types/bank";
import { ObjectId, type Db } from "mongodb";
import type { BondPoolQuoteSnapshot } from "@/lib/bonds/marketPool";
import { getBankId } from "@/lib/centralBank/helpers";
import { getReserveRequirement } from "@/lib/banking/reserves";
import type { CentralBank } from "@/lib/db/types/centralBank";
import { interestBearingCbMarginDebt } from "@/lib/banking/rules/facilityInterest";

export const BANK_TREASURY_TRADES_COLLECTION = "bankTreasuryTrades";

export type BankState = Pick<Corporation, "_id" | "name" | "bankCharter" | "bankTreasuryEscrows">;

export interface BankTreasuryPosition {
  bondId: string;
  issuer: string;
  countryId: string;
  currency: CurrencyCode;
  units: number;
  maturityTurn: number;
  remainingTurns: number;
  couponRate: number;
  bidPerUnitLocal: number;
  askPerUnitLocal: number;
  annualizedContractYieldPercent?: number;
  executablePoolDepthUnits: number;
  publicFloatUnits?: number;
  markedValueLocal: number;
  eligibleToBuy: boolean;
}

export interface BankTreasuryOverview {
  currency: CurrencyCode;
  cashReserves: number;
  cashFloor: ReturnType<typeof computeBankTreasuryCashFloor>;
  spendableCash: number;
  markValueLocal: number;
  autoSweep: boolean;
  fundingRatePercent: number;
  positions: BankTreasuryPosition[];
  /** Present only for explicitly enabled investment-bank primary subscriptions. */
  primaryOffers?: Array<BankTreasuryPosition & { unsoldUnits: number }>;
}

export type BankTreasuryTradeResult =
  | {
      status: "completed";
      tradeId: string;
      side: "buy" | "sell";
      units: number;
      amountLocal: number;
    }
  | {
      status: "pending";
      tradeId: string;
      side: "buy" | "sell";
      units: number;
      amountLocal: number;
      error?: string;
    }
  | {
      status: "rejected";
      tradeId: string;
      side: "buy" | "sell";
      units: number;
      amountLocal: number;
      error: string;
    };

export function roundLocal(amount: number, currency: CurrencyCode): number {
  return roundSavingsAmount(amount, currency);
}

export function holderLotInputs(holders: readonly BondHolder[]) {
  return holders.map((holder) => ({
    bankId: holder.bankId?.toHexString(),
    charteredTurn: holder.charteredTurn,
    lotId: holder.bankTreasuryLotId,
    tradeId: holder.bankTreasuryTradeId,
    units: holder.units,
    avgCostPerUnit: holder.avgCostPerUnit,
  }));
}

export const HOLDER_OBJECT_ID_FIELDS = [
  "characterId",
  "imperialCharacterId",
  "corporationId",
  "fundId",
  "nppId",
  "bankId",
] as const;

export function freezeHolderSnapshot(holders: readonly BondHolder[]): BankTreasuryHolderSnapshot[] {
  return holders.map((holder) => {
    const frozen = { ...holder } as Record<string, unknown>;
    for (const field of HOLDER_OBJECT_ID_FIELDS) {
      const id = holder[field];
      if (id instanceof ObjectId) frozen[field] = id.toHexString();
    }
    return frozen as BankTreasuryHolderSnapshot;
  });
}

export function thawHolderSnapshot(
  snapshot: BankTreasuryTradeReceipt["holderSnapshot"],
  fallback: readonly BondHolder[]
): BondHolder[] {
  if (!snapshot) return [...fallback];
  return snapshot.map((holder) => {
    const thawed = { ...holder } as Record<string, unknown>;
    for (const field of HOLDER_OBJECT_ID_FIELDS) {
      const id = holder[field];
      if (typeof id === "string" && /^[0-9a-f]{24}$/i.test(id)) thawed[field] = new ObjectId(id);
    }
    return thawed as unknown as BondHolder;
  });
}

export function activeHolderUnits(
  holders: readonly BondHolder[],
  bankId: ObjectId,
  charteredTurn: number
): number {
  return bankTreasuryHolderUnits(holderLotInputs(holders), bankId.toHexString(), charteredTurn);
}

export function poolSnapshot(pool: BondPoolQuoteSnapshot | undefined): BondPoolQuoteSnapshot {
  return pool ?? { cashLocal: 0, targetCashLocal: 0 };
}

export async function bankCashFloor(
  db: Db,
  charter: BankCharter,
  playerDepositsAreLiabilities: boolean,
  bankId: ObjectId
): Promise<ReturnType<typeof computeBankTreasuryCashFloor> & { fundingRatePercent: number }> {
  const countryId = getCountryIdForCurrency(charter.currency);
  const centralBankId = getBankId(countryId);
  const [reserveRatio, centralBank, interbankLoans] = await Promise.all([
    getReserveRequirement(db, charter.currency),
    db
      .collection<CentralBank>("centralBanks")
      .findOne({ _id: centralBankId }, { projection: { primeRate: 1, inflationHistory: 1 } }),
    db
      .collection<InterbankLoan>("interbankLoans")
      .find({
        borrowerCorporationId: bankId,
        currency: charter.currency,
        status: "current",
      })
      .project<Pick<InterbankLoan, "outstanding" | "ratePercent">>({
        outstanding: 1,
        ratePercent: 1,
      })
      .toArray(),
  ]);
  const prime =
    typeof centralBank?.primeRate === "number" && Number.isFinite(centralBank.primeRate)
      ? centralBank.primeRate
      : 0;
  const inflation = centralBank?.inflationHistory?.at(-1)?.rate ?? 0;
  const cashBacked =
    Math.max(0, charter.npcDeposits ?? 0) +
    (playerDepositsAreLiabilities ? Math.max(0, charter.playerDeposits ?? 0) : 0);
  // Origination fees are real cash only after a new loan's receipt settles.
  // They are not forecast against this floor, and past fees are not recurring.
  const dueInterestInput = {
    currency: charter.currency,
    primeRate: prime,
    inflationRate: inflation,
    depositOffset: charter.depositOffset,
    npcDeposits: charter.npcDeposits ?? 0,
    totalDeposits:
      charter.totalDeposits ?? (charter.npcDeposits ?? 0) + (charter.playerDeposits ?? 0),
    playerDeposits: charter.playerDeposits ?? 0,
    playerDepositsAreLiabilities,
    discountWindowDebt: charter.discountWindowDebt ?? 0,
    // Interest floor counts only the interest-bearing margin line.
    cbMarginDebt: interestBearingCbMarginDebt(charter),
    interbankLoans: interbankLoans.map((loan) => ({
      outstanding: loan.outstanding ?? 0,
      ratePercent: loan.ratePercent,
    })),
  };
  return {
    ...computeBankTreasuryCashFloor({
      cashBackedDeposits: cashBacked,
      npcDeposits: charter.npcDeposits ?? 0,
      reserveRatio,
      nextTurnDueInterest: computeBankTreasuryDueInterest(dueInterestInput),
    }),
    fundingRatePercent: computeBankTreasuryFundingRatePercent(dueInterestInput),
  };
}
