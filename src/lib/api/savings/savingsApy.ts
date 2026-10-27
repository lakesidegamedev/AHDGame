import { ObjectId, type Db } from "mongodb";
import type { CentralBank, Character, Corporation } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { getCountryIdForCurrency, FOREX_ACTIVE_CURRENCIES } from "@/lib/constants/currencies";
import { getBankId } from "@/lib/centralBank/helpers";
import { savingsApyPercent } from "@/lib/currency/savingsInterest";
import { getCurrentTurn } from "@/lib/currentTurn";
import { loadCentralBankPricingAdjustment } from "@/lib/monetaryPolicy/centralBankPricing";
import { loadBankingPolicy } from "@/lib/banking/policy";
import { savingsReadsAuthoritative } from "@/lib/banking/rules/policy";
import {
  effectiveBankRatesFromPrime,
  holdsPlayerSavings,
  privateHolderSavingsApyPercent,
} from "@/lib/banking/rules/rates";

const DEFAULT_PRIME = 2.5;

type CentralBankSavingsInputs = { prime: number; inflation: number; apyPercent: number };

const roundRatePercent = (rate: number) => Math.round(rate * 100) / 100;

async function loadCentralBankSavingsInputs(
  db: Db
): Promise<Partial<Record<CurrencyCode, CentralBankSavingsInputs>>> {
  const bankIds = [
    ...new Set(FOREX_ACTIVE_CURRENCIES.map((c) => getBankId(getCountryIdForCurrency(c)))),
  ];
  const banks = await db
    .collection<CentralBank>("centralBanks")
    .find({ _id: { $in: bankIds } })
    .project({ _id: 1, primeRate: 1, inflationHistory: 1 })
    .toArray();
  const primeByBankId = new Map(banks.map((b) => [String(b._id), b.primeRate ?? DEFAULT_PRIME]));
  const inflationByBankId = new Map(
    banks.map((b) => [String(b._id), b.inflationHistory?.at(-1)?.rate ?? 0])
  );
  const centralBankPricing = await loadCentralBankPricingAdjustment(db, await getCurrentTurn(db));
  const out: Partial<Record<CurrencyCode, CentralBankSavingsInputs>> = {};
  for (const c of FOREX_ACTIVE_CURRENCIES) {
    const bankId = getBankId(getCountryIdForCurrency(c));
    const prime = primeByBankId.get(bankId) ?? DEFAULT_PRIME;
    const inflation = inflationByBankId.get(bankId) ?? 0;
    out[c] = {
      prime,
      inflation,
      apyPercent: roundRatePercent(
        savingsApyPercent(prime, inflation, centralBankPricing.depositBonusPercentPoints)
      ),
    };
  }
  return out;
}

/**
 * APY percent = half the REAL prime rate (nominal prime − local inflation),
 * matching what {@link computeSavingsInterestForTurn} actually pays. Displaying
 * the nominal ½-prime here would overstate returns for high-inflation currencies.
 */
export async function loadSavingsApyByCurrency(
  db: Db
): Promise<Partial<Record<CurrencyCode, number>>> {
  const inputs = await loadCentralBankSavingsInputs(db);
  const out: Partial<Record<CurrencyCode, number>> = {};
  for (const [c, quote] of Object.entries(inputs)) out[c as CurrencyCode] = quote.apyPercent;
  return out;
}

/**
 * {@link loadSavingsApyByCurrency} for one character's balances: a balance held
 * at a bank that can hold it earns that bank's rate as the savings desk quotes
 * it ({@link privateHolderSavingsApyPercent}); everything else keeps the
 * central-bank APY. Reads the holder banks in one query, and none at all when
 * every balance sits at the central bank.
 */
export async function loadSavingsApyForCharacter(
  db: Db,
  character: Pick<Character, "currencyBalances">
): Promise<Partial<Record<CurrencyCode, number>>> {
  const inputs = await loadCentralBankSavingsInputs(db);
  const out: Partial<Record<CurrencyCode, number>> = {};
  for (const [c, quote] of Object.entries(inputs)) out[c as CurrencyCode] = quote.apyPercent;

  const bankHeld = Object.entries(character.currencyBalances?.savingsHolder ?? {}).filter(
    (entry): entry is [CurrencyCode, string] =>
      entry[0] in inputs && typeof entry[1] === "string" && ObjectId.isValid(entry[1])
  );
  if (bankHeld.length === 0) return out;

  const [policy, holderBanks] = await Promise.all([
    loadBankingPolicy(db),
    db
      .collection<Corporation>("corporations")
      .find({
        _id: { $in: [...new Set(bankHeld.map(([, id]) => id))].map((id) => new ObjectId(id)) },
      })
      .project<Pick<Corporation, "_id" | "bankCharter">>({
        _id: 1,
        "bankCharter.status": 1,
        "bankCharter.currency": 1,
        "bankCharter.type": 1,
        "bankCharter.depositOffset": 1,
        "bankCharter.lendingOffset": 1,
      })
      .toArray(),
  ]);
  const charterById = new Map(holderBanks.map((b) => [b._id.toString(), b.bankCharter]));
  for (const [currency, holderId] of bankHeld) {
    const charter = charterById.get(new ObjectId(holderId).toString());
    const quote = inputs[currency];
    if (!quote || !charter || !holdsPlayerSavings(charter, currency)) continue;
    out[currency] = roundRatePercent(
      privateHolderSavingsApyPercent(
        effectiveBankRatesFromPrime(charter, quote.prime).depositRatePercent,
        savingsReadsAuthoritative(policy, currency),
        quote.prime,
        quote.inflation,
        quote.apyPercent
      )
    );
  }
  return out;
}
