import { describe, expect, it } from "vitest";
import type { CountryId } from "@/lib/constants/countries";
import { FOREX_ACTIVE_COUNTRIES } from "@/lib/constants/currencies";
import { getNationalBudgetSeedConfigsForPreset } from "@/lib/seeds/reference/budgets";
import { COUNTRY_ORDER } from "@/lib/constants/countriesCore";
import { SHIPPING_PRESETS, isRegisteredTier, tierFor } from "@/lib/world/eraRoster";
import { getPresetMonetaryScope } from "./presetMonetaryScope";

describe("getPresetMonetaryScope", () => {
  it.each(SHIPPING_PRESETS)("keeps central-bank coverage inside %s fiscal coverage", (preset) => {
    const scope = getPresetMonetaryScope(preset);
    const budgeted = new Set<CountryId>(
      getNationalBudgetSeedConfigsForPreset(preset).map(({ countryId }) => countryId)
    );

    const expectedForex =
      preset === "1991-default"
        ? [
            ...FOREX_ACTIVE_COUNTRIES.filter((countryId) => countryId !== "DD"),
            "PL",
            "HU",
            "RO",
            "BG",
            "CS",
            "YU",
          ]
        : preset === "2019-default"
          ? [...FOREX_ACTIVE_COUNTRIES, "PL", "HU", "RO", "BG"]
          : preset === "2027-default"
            ? [
                ...FOREX_ACTIVE_COUNTRIES.filter((countryId) => countryId !== "DD"),
                "HU",
                "PL",
                "RO",
                "BG",
              ]
            : FOREX_ACTIVE_COUNTRIES;
    expect(scope.forexCountries).toEqual(expectedForex);
    expect(scope.centralBankCountries.every((countryId) => budgeted.has(countryId))).toBe(true);
    expect(
      new Set([
        ...scope.centralBankCountries,
        ...scope.exclusions
          .filter(({ countryId }) => scope.forexCountries.includes(countryId))
          .map(({ countryId }) => countryId),
      ])
    ).toEqual(new Set(expectedForex));
  });

  it("uses one shared EUR bank for 2027 Bulgaria", () => {
    const scope = getPresetMonetaryScope("2027-default");
    expect(scope.forexCountries).toContain("BG");
    expect(scope.centralBankCountries).toContain("DE");
    expect(scope.centralBankCountries).not.toContain("BG");
    expect(scope.exclusions).toContainEqual(
      expect.objectContaining({ countryId: "BG", reason: "shared-currency-bank" })
    );
    expect(getPresetMonetaryScope("1991-default").forexCountries).toContain("BG");
  });

  it("drives 2027 exchange rows from the roster minus absent countries", () => {
    const scope = getPresetMonetaryScope("2027-default");
    const registered = COUNTRY_ORDER.filter((countryId) =>
      isRegisteredTier(tierFor("2027-default", countryId))
    );
    expect([...scope.forexCountries].sort()).toEqual([...registered].sort());
    expect(scope.forexCountries).toEqual(expect.arrayContaining(["HU", "PL", "RO"]));
    expect(scope.forexCountries).not.toContain("DD");
    // HU seeds a HUF budget and HUF bonds, so its forint gets a central bank.
    expect(scope.centralBankCountries).toContain("HU");
    for (const countryId of ["PL", "RO"] as const) {
      expect(scope.centralBankCountries).not.toContain(countryId);
      expect(scope.exclusions).toContainEqual(
        expect.objectContaining({ countryId, reason: "fiscal-model-unauthored" })
      );
    }
  });

  it.each(["1953-default", "1979-default"])("models RU and DD fiscally in %s", (preset) => {
    const scope = getPresetMonetaryScope(preset);
    expect(scope.centralBankCountries).toEqual(expect.arrayContaining(["RU", "DD"]));
    expect(scope.exclusions.map(({ countryId }) => countryId)).not.toEqual(
      expect.arrayContaining(["RU", "DD"])
    );
  });

  it.each(["1999-default", "2007-default", "2023-default", "2027-default"])(
    "records explicit RU/DD exclusions in %s",
    (preset) => {
      const scope = getPresetMonetaryScope(preset);
      expect(scope.centralBankCountries).not.toEqual(expect.arrayContaining(["RU", "DD"]));
      expect(scope.exclusions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ countryId: "RU", reason: "fiscal-model-unauthored" }),
          expect.objectContaining({ countryId: "DD", reason: "absent-in-era" }),
        ])
      );
    }
  );

  it("covers every authored 1991 transition fiscal book with its own monetary row", () => {
    const scope = getPresetMonetaryScope("1991-default");
    expect(scope.centralBankCountries).toEqual(
      expect.arrayContaining(["RU", "PL", "HU", "RO", "BG", "CS", "YU"])
    );
    expect(scope.exclusions.map(({ countryId }) => countryId)).not.toContain("RU");
    expect(scope.centralBankCountries).not.toContain("DD");
    expect(scope.forexCountries).not.toContain("DD");
    expect(scope.exclusions).toContainEqual(
      expect.objectContaining({ countryId: "DD", reason: "absent-in-era" })
    );
  });

  it("models all five 2019 transition central banks and excludes only absent DD", () => {
    const scope = getPresetMonetaryScope("2019-default");
    expect(scope.centralBankCountries).toEqual(
      expect.arrayContaining(["RU", "PL", "HU", "RO", "BG"])
    );
    expect(scope.exclusions).toContainEqual(
      expect.objectContaining({ countryId: "DD", reason: "absent-in-era" })
    );
    expect(scope.exclusions.map(({ countryId }) => countryId)).not.toContain("RU");
  });

  it.each(SHIPPING_PRESETS)(
    "gives no central bank to a country outside the %s roster",
    (preset) => {
      const scope = getPresetMonetaryScope(preset);
      expect(scope.centralBankCountries.filter((c) => tierFor(preset, c) === "absent")).toEqual([]);
    }
  );

  it("keeps Canada's exchange row but not a central bank before 2027", () => {
    const scope = getPresetMonetaryScope("2019-default");
    expect(scope.forexCountries).toContain("CA");
    expect(scope.centralBankCountries).not.toContain("CA");
    expect(getPresetMonetaryScope("2027-default").centralBankCountries).toContain("CA");
  });
});
