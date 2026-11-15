import { describe, expect, it } from "vitest";
import { legislationTypes as referenceTypes } from "@/lib/seeds/reference/legislationTypes";
import { getProjectedPoliticalLegislationTypes } from "@/lib/admin/seed/seedPoliticalLegislation";
import { POLITICAL_METRIC_COUNTRY_IDS } from "@/lib/politicalMetrics/types";
import { DEPARTMENT_DEFINITIONS } from "./departmentCatalog";
import { auditLegislativeParity } from "./parityAudit";

describe("legislative parity audit", () => {
  it("produces a complete, content-neutral inventory for US, UK, and Japan", () => {
    const audit = auditLegislativeParity({
      legislationTypes: [...referenceTypes, ...getProjectedPoliticalLegislationTypes()],
      departments: DEPARTMENT_DEFINITIONS,
      politicalMetricCountryIds: new Set(POLITICAL_METRIC_COUNTRY_IDS),
    });
    expect(audit.catalogErrors).toEqual([]);
    expect(audit.countries.map((country) => [country.countryId, country.lawCount])).toEqual([
      ["US", 168],
      ["UK", 154],
      // The one law book, the two regional taxes, banking separation and the
      // two mechanical laws the book does not carry.
      ["JP", 157],
    ]);
    expect(audit.countries.every((country) => country.missingAdministration.length === 0)).toBe(
      true
    );
    expect(
      audit.countries.every((country) => country.missingPortfolioInstitutions.length === 0)
    ).toBe(true);
    expect(
      audit.countries.find((country) => country.countryId === "JP")
        ?.authoredPoliticalBaselineAvailable
    ).toBe(true);
  });
});
