import { describe, expect, it } from "vitest";
import { getCountryConfig } from "./countries";
import {
  CURRENCY_ANCHOR_COUNTRY,
  CURRENCY_SYMBOLS,
  FOREX_ACTIVE_CURRENCIES,
  INITIAL_RATES,
  ZOD_ACTIVE_CURRENCY_ENUM,
  ZOD_CURRENCY_ENUM,
  eraRateForCurrency,
  getInitialRates,
  getSeedCurrencyCode,
  getRuntimeInitialRates,
} from "./currencies";
import { getNationalBudgetSeedConfigsForPreset } from "@/lib/seeds/reference/budgets";

const PRESET = "2027-default";

/**
 * World Bank WDI PA.NUS.FCRF, 2024 annual averages, carried into January 2027.
 * https://api.worldbank.org/v2/country/GBR;JPN;SWE;TUR;BRA;CHN;NGA/indicator/PA.NUS.FCRF?date=2024&format=json
 */
const WDI_2024 = {
  UK: 0.7824,
  JP: 151.37,
  BR: 5.389,
  CN: 7.1975,
  NG: 1478.97,
  SE: 10.568,
  TR: 32.806,
} as const;

function budgetFor(preset: string, countryId: string) {
  const row = getNationalBudgetSeedConfigsForPreset(preset).find(
    (config) => config.countryId === countryId
  );
  if (!row) throw new Error(`no ${countryId} budget in ${preset}`);
  return row;
}

describe("2027 exchange rates", () => {
  it("carries 2024 annual averages for the non-euro roster", () => {
    const rates = getInitialRates(PRESET);
    for (const [countryId, rate] of Object.entries(WDI_2024)) {
      expect(rates[countryId as keyof typeof WDI_2024], countryId).toBe(rate);
    }
    // Already on 2024 central-bank averages, unchanged here.
    expect(rates.PL).toBe(3.9812);
    expect(rates.RO).toBe(4.5984);
    expect(rates.RU).toBe(92.5);
    // EUR stays on the game anchor every euro conversion is built on.
    expect(rates.DE).toBe(0.92);
  });

  it("leaves every other preset's table untouched", () => {
    expect(INITIAL_RATES.SE).toBe(4.29);
    expect(INITIAL_RATES.TR).toBe(34.5);
    expect(INITIAL_RATES.JP).toBe(106);
    expect(INITIAL_RATES.UK).toBe(0.75);
    expect(getInitialRates("2019-default").SE).toBe(4.29);
    expect(getInitialRates("2019-default").TR).toBe(34.5);
    expect(getRuntimeInitialRates("2023-default").JP).toBe(106);
  });
});

describe("modern Turkish lira (TRY)", () => {
  it("seeds TR in TRY only in the 2027 world", () => {
    expect(getSeedCurrencyCode("TR", PRESET)).toBe("TRY");
    for (const preset of ["1953-default", "1979-default", "1991-default", "2019-default"]) {
      expect(getSeedCurrencyCode("TR", preset)).toBe("TRL");
    }
    expect(getCountryConfig("TR", PRESET).currencyCode).toBe("TRY");
    expect(getCountryConfig("TR", "2019-default").currencyCode).toBe("TRL");
  });

  it("registers the code, anchor and rate", () => {
    expect(CURRENCY_ANCHOR_COUNTRY.TRY).toBe("TR");
    expect(CURRENCY_SYMBOLS.TRY).toBe("₺");
    expect(ZOD_CURRENCY_ENUM).toContain("TRY");
    expect(ZOD_ACTIVE_CURRENCY_ENUM).toContain("TRY");
    expect(FOREX_ACTIVE_CURRENCIES).toContain("TRY");
    expect(eraRateForCurrency("TRY", PRESET)).toBe(WDI_2024.TR);
    expect(eraRateForCurrency("TRY", "2019-default")).toBeUndefined();
  });
});

describe("2027 budgets on the new rate scale", () => {
  it.each([
    ["SE", "SEK", "SEK"],
    ["TR", "TRL", "TRY"],
  ] as const)(
    "rebases the inherited %s book at constant USD value",
    (countryId, legacyCode, code) => {
      const legacy = budgetFor("2023-default", countryId);
      const modern = budgetFor(PRESET, countryId);
      expect(legacy.currencyCode).toBe(legacyCode);
      expect(modern.currencyCode).toBe(code);
      const legacyRate = INITIAL_RATES[countryId]!;
      const rate = getInitialRates(PRESET)[countryId]!;
      expect(modern.gdp / rate).toBeCloseTo(legacy.gdp / legacyRate, 0);
      expect(modern.debt.principal / rate).toBeCloseTo(legacy.debt.principal / legacyRate, 0);
      expect(modern.otherRevenue / rate).toBeCloseTo(legacy.otherRevenue / legacyRate, 0);
      expect(modern.baselineStateGrants / rate).toBeCloseTo(
        legacy.baselineStateGrants / legacyRate,
        0
      );
      for (const [key, value] of Object.entries(legacy.baselineSpendingByCategory)) {
        expect(modern.baselineSpendingByCategory[key]! / rate, key).toBeCloseTo(
          value / legacyRate,
          0
        );
      }
      // Ratios do not move.
      expect(modern.taxBaseRatios).toEqual(legacy.taxBaseRatios);
      expect(modern.debt.interestRate).toBe(legacy.debt.interestRate);
    }
  );

  it("keeps budgets already authored in real local money as they are", () => {
    // JP, UK, BR, CN and NG rows hold real local amounts, so only the rate moves.
    for (const countryId of ["JP", "UK", "BR", "CN", "NG"]) {
      const legacy = budgetFor("2023-default", countryId);
      const modern = budgetFor(PRESET, countryId);
      if (modern.sourceFiscalYear === undefined) continue;
      expect(modern.gdp, countryId).toBe(legacy.gdp);
      expect(modern.currencyCode, countryId).toBe(legacy.currencyCode);
    }
  });

  it("prices every 2027 budget in a currency that has a 2027 rate", () => {
    for (const row of getNationalBudgetSeedConfigsForPreset(PRESET)) {
      expect(eraRateForCurrency(row.currencyCode, PRESET), row.countryId).toBeGreaterThan(0);
    }
  });
});
