/**
 * Money rules for the economy-only reset: wallet endowments, the central bank
 * write-off, the public buyer sweep, defence encumbrance and pension
 * conversion. Plain data in, plain data out; the shell loads and writes.
 */
import { campaignLocalRate, type CampaignCurrencyRates } from "@/lib/campaigns/rules/currency";
import { getWealthBonus, type WealthLevel } from "@/lib/constants/characterWealth";
import { getSeedCurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import { getEraNominalAmount } from "@/lib/constants/sectorSeedEra";
import type {
  CentralBankAdjustment,
  CharacterEndowmentPatch,
  DefenceRelease,
  PensionConversion,
  PublicBuyerSweep,
} from "../types";

/** Same modern amount the character route grants a referred player. */
const REFERRAL_PERSONAL_CAPITAL_MODERN = 500_000;

export type CurrencyAmounts = Record<string, number>;

export interface CharacterEndowmentInput {
  id: string;
  countryId: string;
  wealth?: string | null;
  referred: boolean;
}

/**
 * The personal cash a character was created with, recomputed for the world it
 * lives in now: wealth bonus plus the referral bonus, converted at the frozen
 * campaign base rate into the home currency, as the character route does.
 */
export function characterEndowment(
  input: CharacterEndowmentInput,
  preset: string,
  campaignRates: CampaignCurrencyRates
): CharacterEndowmentPatch {
  const wealthBonus = getWealthBonus(input.wealth as WealthLevel, preset);
  const referral = input.referred
    ? getEraNominalAmount(REFERRAL_PERSONAL_CAPITAL_MODERN, preset)
    : 0;
  const anchor = wealthBonus + referral;
  const rate = campaignLocalRate(input.countryId, campaignRates, preset);
  return {
    id: input.id,
    countryId: input.countryId,
    currency: getSeedCurrencyCode(input.countryId as CountryId, preset),
    personalLocal: Math.round(anchor * rate),
    cashOnHand: anchor,
  };
}

/**
 * Field writes that reset one character's private money. Campaign funds,
 * identity and career fields are untouched.
 */
export function characterMoneyUpdate(
  patch: CharacterEndowmentPatch,
  currentTurn: number
): { $set: Record<string, unknown>; $unset: Record<string, ""> } {
  return {
    $set: {
      "currencyBalances.personal": { [patch.currency]: patch.personalLocal },
      "currencyBalances.savings": {},
      "currencyBalances.savingsHolder": {},
      "currencyBalances.interestEarned": {},
      "currencyBalances.pendingSavingsInterest": {},
      cashOnHand: patch.cashOnHand,
      savingsOnHand: 0,
      lineOfCredit: { balances: {}, arrears: {} },
      pendingStockTaxReceipts: [],
      ceoNiTenure: null,
      ceoNiTier: null,
      incomeTaxBatchReceipt: null,
      incomeTaxStartTurn: currentTurn,
    },
    $unset: {
      savingsAccountsOpened: "",
      appliedMoneyFlowKeys: "",
      forexExpiryRefunds: "",
      pendingLocSettlement: "",
    },
  };
}

/** Imperial wallets start empty, as on a full reset, on the kept clock. */
export function imperialMoneyUpdate(
  initialIncomeTier: string | null | undefined,
  currentTurn: number
): { $set: Record<string, unknown> } {
  return {
    $set: {
      cashOnHand: 0,
      "currencyBalances.personal": {},
      incomeTaxBatchReceipt: null,
      incomeTaxStartTurn: currentTurn,
      pendingStockTaxReceipts: [],
      incomeTier: initialIncomeTier ?? "high",
    },
  };
}

/** NPP private money back to the spawn state; the campaign war chest stays. */
export const NPP_MONEY_UNSET: Readonly<Record<string, "">> = Object.freeze({
  currencyBalances: "",
  nppInvestmentCashAnchor: "",
  lastIndexFundInvestmentTurn: "",
});

export interface LineOfCreditBook {
  balances?: CurrencyAmounts;
  arrears?: CurrencyAmounts;
}

/** Principal plus arrears outstanding, by currency. */
export function lineOfCreditOutstanding(
  book: LineOfCreditBook | null | undefined
): CurrencyAmounts {
  const out: CurrencyAmounts = {};
  for (const source of [book?.balances, book?.arrears])
    for (const [currency, amount] of Object.entries(source ?? {}))
      if (Number.isFinite(amount) && amount > 0) out[currency] = (out[currency] ?? 0) + amount;
  return out;
}

/** Savings held at the central bank: no holder recorded, or the central bank itself. */
export function centralBankHeldSavings(
  savings: CurrencyAmounts | null | undefined,
  holders: Record<string, string> | null | undefined
): CurrencyAmounts {
  const out: CurrencyAmounts = {};
  for (const [currency, amount] of Object.entries(savings ?? {})) {
    const holder = holders?.[currency];
    if (holder !== undefined && holder !== "centralBank") continue;
    if (Number.isFinite(amount) && amount > 0) out[currency] = amount;
  }
  return out;
}

export function addAmounts(into: CurrencyAmounts, from: CurrencyAmounts): CurrencyAmounts {
  for (const [currency, amount] of Object.entries(from))
    into[currency] = (into[currency] ?? 0) + amount;
  return into;
}

/**
 * The central bank absorbs the write-off. Deposits it held are extinguished
 * (a liability gone, so reserves rise) and the credit lines it extended are
 * forgiven (an asset gone, so reserves fall). Reserves never go negative; the
 * part they cannot absorb is recorded as unabsorbed.
 */
export function centralBankAdjustments(input: {
  banks: { bankId: string; reserveBalance: number }[];
  bankIdByCurrency: Record<string, string>;
  centralBankSavings: CurrencyAmounts;
  locWrittenOff: CurrencyAmounts;
}): { adjustments: CentralBankAdjustment[]; blockers: string[] } {
  const blockers: string[] = [];
  const currencyByBank = new Map<string, string>();
  const currencies = [
    ...new Set([...Object.keys(input.centralBankSavings), ...Object.keys(input.locWrittenOff)]),
  ].sort();
  for (const currency of currencies) {
    const bankId = input.bankIdByCurrency[currency];
    if (!bankId) {
      blockers.push(`missing-central-bank:${currency}`);
      continue;
    }
    const existing = currencyByBank.get(bankId);
    if (existing && existing !== currency)
      blockers.push(`central-bank-currency-collision:${bankId}:${existing}:${currency}`);
    else currencyByBank.set(bankId, currency);
  }
  const reserves = new Map(input.banks.map((bank) => [bank.bankId, bank.reserveBalance]));
  const adjustments: CentralBankAdjustment[] = [];
  for (const [bankId, currency] of [...currencyByBank].sort(([a], [b]) => a.localeCompare(b))) {
    if (!reserves.has(bankId)) {
      blockers.push(`missing-central-bank:${bankId}`);
      continue;
    }
    const before = reserves.get(bankId) ?? 0;
    const savings = input.centralBankSavings[currency] ?? 0;
    const loc = input.locWrittenOff[currency] ?? 0;
    const raw = before + savings - loc;
    adjustments.push({
      bankId,
      currency,
      centralBankSavingsDestroyed: savings,
      locWrittenOff: loc,
      reserveBalanceBefore: before,
      reserveBalanceAfter: Math.max(0, raw),
      unabsorbed: Math.max(0, -raw),
    });
  }
  return { adjustments, blockers };
}

/**
 * Public buyer wallets were funded from budgets, so their cash goes back to
 * the treasury that paid it, converted through anchor rates when the wallet
 * and the treasury use different currencies.
 */
export function publicBuyerSweeps(input: {
  wallets: { walletId: string; countryId: string; currency: string; cash: number }[];
  budgets: { budgetId: string; countryId: string; currencyCode: string }[];
  anchorRates: Record<string, number>;
}): { sweeps: PublicBuyerSweep[]; blockers: string[] } {
  const blockers: string[] = [];
  const budgetByCountry = new Map(input.budgets.map((budget) => [budget.countryId, budget]));
  const sweeps: PublicBuyerSweep[] = [];
  for (const wallet of [...input.wallets].sort((a, b) => a.walletId.localeCompare(b.walletId))) {
    if (!Number.isFinite(wallet.cash) || wallet.cash === 0) continue;
    const budget = budgetByCountry.get(wallet.countryId);
    if (!budget) {
      blockers.push(`missing-public-buyer-treasury:${wallet.walletId}`);
      continue;
    }
    let credit = wallet.cash;
    if (budget.currencyCode !== wallet.currency) {
      const from = input.anchorRates[wallet.currency];
      const to = input.anchorRates[budget.currencyCode];
      if (!(from > 0) || !(to > 0)) {
        blockers.push(`missing-exchange-rate:${wallet.currency}:${budget.currencyCode}`);
        continue;
      }
      credit = (wallet.cash / from) * to;
    }
    sweeps.push({
      walletId: wallet.walletId,
      countryId: wallet.countryId,
      budgetId: budget.budgetId,
      walletCurrency: wallet.currency,
      walletCash: wallet.cash,
      treasuryCurrency: budget.currencyCode,
      treasuryCredit: credit,
    });
  }
  return { sweeps, blockers };
}

/**
 * Release the appropriation each country still has committed to open defence
 * contracts, so the wiped contracts do not hold the budget hostage. Floored at
 * what is actually encumbered, like releaseEncumbrance.
 */
export function defenceReleases(input: {
  contracts: { countryId: string; encumberedAmount: number }[];
  encumberedByCountry: Record<string, number>;
}): DefenceRelease[] {
  const owed = new Map<string, number>();
  for (const contract of input.contracts) {
    const amount = Math.round(contract.encumberedAmount);
    if (amount > 0) owed.set(contract.countryId, (owed.get(contract.countryId) ?? 0) + amount);
  }
  return [...owed]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([countryId, amount]) => {
      const encumberedBefore = Math.max(0, input.encumberedByCountry[countryId] ?? 0);
      return { countryId, encumberedBefore, release: Math.min(amount, encumberedBefore) };
    })
    .filter((row) => row.release > 0);
}

/**
 * Pension schemes are kept whole. Their index-fund units go away with the
 * funds, so the last marked value of those units is paid in as cash.
 */
export function pensionConversions(
  schemes: { id: string; assetsAnchor: number; investedValueAnchor?: number }[]
): PensionConversion[] {
  return [...schemes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter(
      (scheme) => Number.isFinite(scheme.investedValueAnchor) && scheme.investedValueAnchor! > 0
    )
    .map((scheme) => ({
      id: scheme.id,
      assetsAnchorBefore: scheme.assetsAnchor,
      investedValueAnchor: scheme.investedValueAnchor!,
    }));
}
