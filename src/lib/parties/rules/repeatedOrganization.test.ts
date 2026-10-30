import { describe, expect, it } from "vitest";
import { quoteOrganizationBatch } from "./repeatedOrganization";
import {
  effectivePsCost,
  BUILD_ORG_BASE_PS_COST,
  PRESSURE_LADDER_INCREMENT,
  PRESSURE_LADDER_MAX_VALUE,
} from "@/lib/politicalStrength/strengthConstants";
import { orgBuildCashPrice } from "@/lib/politicalStrength/buildOrgFunding";
import { COUNTRY_ORDER } from "@/lib/constants/countriesCore";

describe("repeated organization pricing", () => {
  it.each(COUNTRY_ORDER)(
    "matches sequential single builds in %s for either treasury tier",
    (countryId) => {
      for (const scope of ["state", "national-targeted"] as const) {
        for (const count of [1, 5, 10]) {
          let pressure = 2;
          let psCost = 0;
          let cashPrice = 0;
          for (let i = 0; i < count; i++) {
            const cost = effectivePsCost(BUILD_ORG_BASE_PS_COST, pressure);
            psCost += cost;
            cashPrice += orgBuildCashPrice(countryId, scope, cost, 1.25);
            pressure = Math.min(PRESSURE_LADDER_MAX_VALUE, pressure + PRESSURE_LADDER_INCREMENT);
          }
          expect(
            quoteOrganizationBatch({ countryId, scope, pressure: 2, count, sizeMultiplier: 1.25 })
          ).toEqual({ psCost, cashPrice });
        }
      }
    }
  );
  it("does not discount the escalating price of a fresh ten-build batch", () => {
    const ten = quoteOrganizationBatch({
      countryId: "UK",
      scope: "state",
      pressure: 0,
      count: 10,
      sizeMultiplier: 1,
    });
    const one = quoteOrganizationBatch({
      countryId: "UK",
      scope: "state",
      pressure: 0,
      count: 1,
      sizeMultiplier: 1,
    });
    expect(ten.psCost).toBeGreaterThan(one.psCost * 10);
  });
});
