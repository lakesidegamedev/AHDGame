import { describe, expect, it } from "vitest";
import { resetLawFamilies } from "./catalog";
import { openingLawReference, openingLawReferences } from "./openingLaw";
import { resetTaxes } from "./taxCatalog";
import { getBasePolicies } from "@/lib/seeds/reference/basePolicies";
import { ieRegions1991 } from "@/lib/countries/ie/data/ieRegions1991";

describe("1991 current-law references", () => {
  it("covers every family and tax type for all four opening countries at both scopes", () => {
    expect(openingLawReferences).toHaveLength(488);
    expect(new Set(openingLawReferences.map((row) => row.key)).size).toBe(488);
    const ids = [
      ...resetLawFamilies.map((family) => family.id),
      ...new Set(resetTaxes.map((tax) => tax.id)),
    ];
    for (const country of ["US", "UK", "JP", "IE"] as const) {
      for (const scope of ["national", "regional"] as const) {
        for (const id of ids)
          expect(
            openingLawReference(country, scope, id),
            `${country} ${scope} ${id}`
          ).toBeDefined();
      }
    }
  });

  it("keeps present-day seed laws out of the 1991 reset baseline", () => {
    expect(openingLawReference("UK", "national", "L01")?.sourceComponents).toContainEqual(
      expect.objectContaining({
        sourceId: "uk_universal_credit",
        historicalDisposition: "not-adopted-as-1991-law",
      })
    );
    expect(openingLawReference("UK", "national", "L30")?.currentLaw).toMatch(
      /no statutory net-zero target/i
    );
  });

  it("provides reference text without treating center as current law", () => {
    for (const row of openingLawReferences) {
      expect(row.currentLaw.trim()).not.toBe("");
      expect(row.currentLaw).not.toMatch(/[\u2013\u2014]/);
      expect(row.legalNote).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it("retains actual source option and books each source to one family per scope", () => {
    const owned = new Set<string>();
    for (const row of openingLawReferences) {
      for (const component of row.sourceComponents) {
        expect(component.selectedOption.trim()).not.toBe("");
        expect(component.optionIndex).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(component.annualBooked)).toBe(true);
        if (component.fiscalRole !== "single-booked-owner") continue;
        const key = `${row.country}:${row.scope}:${component.sourceId}`;
        expect(owned.has(key), key).toBe(false);
        owned.add(key);
        expect(component.fiscalOwner).toBe(row.familyId);
      }
    }
    expect(openingLawReference("US", "national", "L19")?.sourceComponents).toContainEqual(
      expect.objectContaining({
        sourceId: "us_public_health",
        selectedOption: "Public Health Services Act",
        optionIndex: 3,
        annualBooked: 2_585_421_384,
      })
    );
  });

  it("matches every regional source component to each actual 1991 region policy seed", async () => {
    const policies = await getBasePolicies("1991-default");
    const byRegionAndSource = new Map(
      policies
        .filter((policy) => policy.scope === "state")
        .map((policy) => [`${policy.stateId}:${policy.legislationTypeId}`, policy])
    );
    const regions = { IE: ieRegions1991 };
    for (const country of ["IE"] as const) {
      for (const region of regions[country]) {
        for (const reference of openingLawReferences.filter(
          (row) => row.country === country && row.scope === "regional"
        )) {
          for (const component of reference.sourceComponents) {
            const key = `${region._id}:${component.sourceId}`;
            expect(byRegionAndSource.get(key)?.policyOptionIndex, `${country}:${key}`).toBe(
              component.optionIndex
            );
          }
        }
      }
    }
  });
});
