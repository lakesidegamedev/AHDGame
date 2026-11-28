import { uniqueTurnHistory } from "@/lib/turn/rules/turnHistory";
// GET /api/country/[code]/central-bank/savings — National savings totals, prime/APY, character balances, ledger, chart history
// Auth: requireBasicAuth
// Errors: 401, 404

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCharacterByUserId } from "@/lib/db/characterLookup";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { handleRouteError, errorResponse } from "@/lib/api/errors";

import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { FOREX_ACTIVE_COUNTRIES, getSeedCurrencyCode } from "@/lib/constants/currencies";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import {
  getLifetimeInterestEarnedInCurrency,
  getPersonalBalance,
  getSavingsBalance,
} from "@/lib/currency/characterFunds";
import { sumSavingsInCurrency } from "@/lib/savings/nationalTotals";
import { fetchSavingsLedgerForCharacter } from "@/lib/savings/ledger";
import {
  estimateSavingsAccrualFromApy,
  savingsApyPercent,
  interestEligibleBalance,
  SAVINGS_CREDIT_INTERVAL_TURNS,
  turnsUntilSavingsCredit,
} from "@/lib/currency/rules/savingsInterest";
import { getGameState } from "@/lib/gameState";
import { getBankId } from "@/lib/centralBank/helpers";
import { loadCentralBankPricingAdjustment } from "@/lib/monetaryPolicy/centralBankPricing";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { savingsReadsAuthoritative } from "@/lib/banking/rules/policy";
import {
  effectiveBankRatesFromPrime,
  holdsPlayerSavings,
  privateHolderSavingsApyPercent,
} from "@/lib/banking/rules/rates";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { portfolioHistoryCollection } from "@/lib/db/repositories/portfolioHistory";

const DEFAULT_PRIME = 2.5;

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const auth = await requireBasicAuth();
    if (!auth.ok) return auth.response;

    const { code } = await params;
    const countryId = code.toUpperCase() as CountryId;
    if (!COUNTRY_CONFIGS[countryId]) {
      return errorResponse(404, "Country not found");
    }
    if (!FOREX_ACTIVE_COUNTRIES.includes(countryId)) {
      return errorResponse(404, "High-yield savings are not available for this country.");
    }

    const db = await getDb();
    const [forexEnabled, character, bank, gameState] = await Promise.all([
      isForexEnabled(),
      getCharacterByUserId(db, auth.user.userId),
      centralBanksCollection(db).findOne({ _id: getBankId(countryId) }),
      getGameState(),
    ]);

    if (!character) {
      return errorResponse(404, "Character not found");
    }

    // Preset-aware: 2027 euro members read EUR balances/ledgers; every other
    // preset resolves through the era-blind map exactly as before. gameState
    // was already loaded here, so no new read.
    const nationalCurrency = getSeedCurrencyCode(countryId, gameState?.preset ?? "");
    const primeRate = bank?.primeRate ?? DEFAULT_PRIME;
    const inflationRate = uniqueTurnHistory(bank?.inflationHistory ?? []).at(-1)?.rate ?? 0;

    const [totalNationalSavings, ledger, history] = await Promise.all([
      sumSavingsInCurrency(db, nationalCurrency),
      fetchSavingsLedgerForCharacter(db, character._id, nationalCurrency, 75),
      // Most recent 500 turns; sort descending server-side then reverse for the
      // chart consumer (ascending) so long-lived characters don't see the chart
      // truncate to the oldest 500 snapshots.
      portfolioHistoryCollection(db)
        .find({ characterId: character._id })
        .sort({ turn: -1 })
        .limit(500)
        .project({
          _id: 0,
          turn: 1,
          savingsCashValue: 1,
          exchangeRatesSnapshot: 1,
        })
        .toArray()
        .then((arr) => arr.reverse()),
    ]);
    const centralBankPricing = await loadCentralBankPricingAdjustment(
      db,
      gameState?.currentTurn ?? 0
    );
    const centralBankApyPercent = savingsApyPercent(
      primeRate,
      inflationRate,
      centralBankPricing.depositBonusPercentPoints
    );

    const holder = character.currencyBalances?.savingsHolder?.[nationalCurrency];
    const holderIsCentralBank =
      !holder || holder === "centralBank" || holder === getBankId(countryId);
    const holderId =
      typeof holder === "string" && ObjectId.isValid(holder) ? new ObjectId(holder) : null;
    const [bankingPolicy, holderBank] = await Promise.all([
      loadBankingPolicy(db),
      holderIsCentralBank || !holderId
        ? Promise.resolve(null)
        : corporationsCollection(db).findOne({ _id: holderId }),
    ]);
    const validPrivateHolder = holdsPlayerSavings(holderBank?.bankCharter, nationalCurrency);
    let apyPercent = centralBankApyPercent;
    let accrualApyPercent = centralBankApyPercent;
    let savingsHolderType: "central-bank" | "private-bank" | "unknown" = holderIsCentralBank
      ? "central-bank"
      : "unknown";
    let savingsHolderName: string | null = holderIsCentralBank ? "Central Bank" : null;
    if (validPrivateHolder && holderBank?.bankCharter) {
      const postedRate = effectiveBankRatesFromPrime(
        holderBank.bankCharter,
        primeRate
      ).depositRatePercent;
      const authoritative = savingsReadsAuthoritative(bankingPolicy, nationalCurrency);
      accrualApyPercent = privateHolderSavingsApyPercent(
        postedRate,
        authoritative,
        primeRate,
        inflationRate,
        centralBankApyPercent
      );
      apyPercent = Math.round(accrualApyPercent * 100) / 100;
      savingsHolderType = "private-bank";
      savingsHolderName = holderBank.name ?? "Private bank";
    }
    if (savingsHolderType === "unknown") {
      // A stale or unverifiable bank pointer does not mean the account earns
      // the central-bank rate. Keep the estimate at zero and let the UI show
      // that the holder's rate could not be verified.
      accrualApyPercent = 0;
      apyPercent = 0;
    }

    const liquidBalance = getPersonalBalance(character, nationalCurrency, forexEnabled);
    const savingsBalance = getSavingsBalance(character, nationalCurrency, forexEnabled);
    const lifetimeInterestEarned = getLifetimeInterestEarnedInCurrency(
      character,
      nationalCurrency,
      forexEnabled
    );
    const pendingInterest =
      character.currencyBalances?.pendingSavingsInterest?.[nationalCurrency] ?? 0;
    const creditIntervalTurns =
      savingsHolderType === "private-bank" &&
      savingsReadsAuthoritative(bankingPolicy, nationalCurrency)
        ? 1
        : SAVINGS_CREDIT_INTERVAL_TURNS;
    const turnsUntilCredit =
      creditIntervalTurns === 1 ? 1 : turnsUntilSavingsCredit(gameState?.currentTurn ?? 0);
    const eligibleBalance =
      savingsHolderType === "central-bank"
        ? interestEligibleBalance(savingsBalance, bank?.nationalSavingsBalance ?? 0)
        : savingsBalance;
    const estimatedAccrualThisTurn =
      forexEnabled && savingsBalance > 0
        ? estimateSavingsAccrualFromApy(eligibleBalance, accrualApyPercent, nationalCurrency)
        : 0;

    return NextResponse.json({
      countryId,
      currencyCode: nationalCurrency,
      primeRate,
      inflationRate,
      apyPercent: Math.round(apyPercent * 100) / 100,
      creditIntervalTurns,
      interestEligibleBalance: eligibleBalance,
      savingsHolderType,
      savingsHolderName,
      centralBankDepositBonusPercentPoints: centralBankPricing.depositBonusPercentPoints,
      centralBankPricingProgress: centralBankPricing.progress,
      centralBankPricingTurnsRemaining: centralBankPricing.turnsRemaining,
      centralBankPricingActive: centralBankPricing.startedTurn !== undefined,
      totalNationalSavings,
      liquidBalance,
      savingsBalance,
      lifetimeInterestEarned,
      pendingInterest,
      estimatedAccrualThisTurn,
      turnsUntilCredit,
      accountOpened: character.savingsAccountsOpened?.[nationalCurrency] === true,
      ledger,
      savingsHistory: history.map((h) => ({
        turn: h.turn,
        savingsCashValue: h.savingsCashValue ?? 0,
        exchangeRatesSnapshot: h.exchangeRatesSnapshot,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
