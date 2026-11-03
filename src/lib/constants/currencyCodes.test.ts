import { describe, expect, it } from "vitest";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import type { CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CURRENCY_MAP } from "./currencyCodes";

describe("COUNTRY_CURRENCY_MAP", () => {
  it("matches each country config's currencyCode", () => {
    for (const id of Object.keys(COUNTRY_CURRENCY_MAP) as CountryId[]) {
      expect(COUNTRY_CURRENCY_MAP[id]).toBe(COUNTRY_CONFIGS[id].currencyCode);
    }
  });
});
