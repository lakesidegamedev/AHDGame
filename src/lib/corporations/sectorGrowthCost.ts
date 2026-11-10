import type { Db } from "mongodb";
import type { CentralBank } from "@/lib/db/types";
import { calculateDailyGrowthCost, GROWTH_RATE_TURNS_PER_YEAR } from "@/lib/constants/corporations";
import { getCountryConfig } from "@/lib/constants/countries";
import { getBankId } from "@/lib/centralBank/helpers";
import type { CountryId } from "@/lib/constants/countries";
import { NEUTRAL_STAT } from "@/lib/stats/statsConstants";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";

/**
 * Growth rate is per game year (48 turns); return value is the daily (24-turn)
 * cost that callers divide by TURNS_PER_DAY to charge per turn. `acumen` is
 * the CEO's Business Acumen (defaults neutral).
 */
export function growthCostFor(
  revenue: number,
  growthRatePct: number,
  primeRate: number,
  marketSharePercent: number,
  acumen: number = NEUTRAL_STAT,
  /** Sector tech-tree growth-cost multiplier (1 = none); keeps preview == turn. */
  techGrowthCostMultiplier: number = 1
): number {
  const perTurnGrowthRate = growthRatePct / GROWTH_RATE_TURNS_PER_YEAR;
  return (
    calculateDailyGrowthCost(revenue, perTurnGrowthRate, primeRate, marketSharePercent, acumen) *
    techGrowthCostMultiplier
  );
}

/**
 * Resolve a country's prime rate, falling back to its configured default. Used
 * once per bulk action so a whole sector type shares a single lookup.
 */
export async function resolveCountryPrimeRate(db: Db, countryId: CountryId): Promise<number> {
  // getBankId: shared-bank members (IE → ECB) have no doc under their own id.
  const centralBank = await centralBanksCollection(db).findOne({ _id: getBankId(countryId) });
  return centralBank?.primeRate ?? getCountryConfig(countryId).centralBank.defaultPrimeRate;
}

/** Resolve prime rates for several countries with one central-bank read. */
export async function resolveCountryPrimeRates(
  db: Db,
  countryIds: readonly CountryId[]
): Promise<Map<CountryId, number>> {
  const uniqueCountryIds = [...new Set(countryIds)];
  if (uniqueCountryIds.length === 0) return new Map();

  const bankIdByCountry = new Map(
    uniqueCountryIds.map((countryId) => [countryId, getBankId(countryId)])
  );
  const bankIds = [...new Set(bankIdByCountry.values())];
  const banks = await centralBanksCollection(db)
    .find({ _id: { $in: bankIds } })
    .project<Pick<CentralBank, "_id" | "primeRate">>({ _id: 1, primeRate: 1 })
    .toArray();
  const primeRateByBankId = new Map(banks.map((bank) => [String(bank._id), bank.primeRate]));

  return new Map(
    uniqueCountryIds.map((countryId) => [
      countryId,
      primeRateByBankId.get(String(bankIdByCountry.get(countryId))) ??
        getCountryConfig(countryId).centralBank.defaultPrimeRate,
    ])
  );
}
