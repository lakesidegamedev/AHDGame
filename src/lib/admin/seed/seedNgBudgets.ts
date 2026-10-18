import type { Db } from "mongodb";
import { seedCountryBudgets } from "./seedCountryBudgets";
import { getInitialRates } from "@/lib/constants/currencies";

export async function seedNgBudgets(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  return seedCountryBudgets(db, reset, log, preset, {
    countryId: "NG",
    fiscalYearFallback: 2023,
    afterNationalBudget: async () => {
      // Seed NGN exchange rate so the commodity price turn can normalize NG state
      // budgets (stored in local NGN) to anchor USD. Use the era-appropriate rate for
      // the active preset (e.g. 1953 colonial West African pound ~0.357, not the
      // modern ~1550 naira) so a historical reseed isn't anachronistic. NG IS
      // forex-active, so seedForex/seedExchangeRates also seeds this row era-aware;
      // this writer just runs first in bootstrap ordering. $setOnInsert keeps any
      // live rate that may have been set via admin tooling.
      const ngnRate = getInitialRates(preset)["NG"] ?? 1550;
      await db.collection("exchangeRates").updateOne(
        { _id: "NG" as never },
        {
          $setOnInsert: {
            _id: "NG",
            countryId: "NG",
            currencyCode: "NGN",
            rate: ngnRate,
            baseRate: ngnRate,
            macroTarget: ngnRate,
            rateHistory: [],
            buyVolume24: 0,
            sellVolume24: 0,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
      log(`Seeded NGN exchange rate (${ngnRate} NGN/USD)`);
    },
  });
}
