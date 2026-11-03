import { describe, expect, it } from "vitest";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import { states } from "@/lib/countries/us/data/usStates";
import { getCountryLayer1Model } from "@/lib/seeds/international";
import { getTurnoutTargetsForCountry } from "../turnoutTargets";
import { PRIORITY_COUNTRIES } from "./catalog";
import { resolveLegislativePriorities, type PriorityLaw } from "./rules";

const laws: ReadonlyMap<string, PriorityLaw> = new Map(
  legislationTypes.map((law) => [law._id, { ...law, policyOptions: law.policyOptions ?? [] }])
);
const eras = ["1953", "1979", "1991", "1999", "2007", "2019", "2023", "2027"] as const;
const requestedDimensions = new Set(["race", "ethnicity", "age", "education", "wealth", "income"]);

describe("electorate legislative priorities", () => {
  it.each(["US", "UK", "JP"])(
    "%s: every authored topic references an exact country law option",
    (cc) => {
      for (const reference of Object.values(PRIORITY_COUNTRIES[cc].topics)) {
        const law = laws.get(reference!.lawTypeId);
        expect(law?.countryScope).toBe(cc.toLowerCase());
        expect(law?.policyOptions.some((o) => o.id === reference!.policyOptionId)).toBe(true);
      }
    }
  );

  it.each(["US", "UK", "JP"])(
    "%s: covers every region and every requested bucket across all eras",
    (cc) => {
      for (const era of eras) {
        const regions =
          cc === "US"
            ? states.map((state) => state._id)
            : Object.keys(getCountryLayer1Model(cc, era)!.census);
        for (const region of regions) {
          expect(PRIORITY_COUNTRIES[cc].regions[region], `${cc}/${region}`).toBeDefined();
          for (const section of getTurnoutTargetsForCountry(cc, `${era}-default`)) {
            if (!requestedDimensions.has(section.dim)) continue;
            for (const bucket of section.options) {
              const priorities = resolveLegislativePriorities(cc, region, bucket.id, laws);
              expect(priorities, `${cc}/${era}/${region}/${bucket.id}`).not.toBeNull();
              const all = [priorities!.primary, ...priorities!.secondary];
              expect(all).toHaveLength(4);
              expect(new Set(all.map((p) => p.lawTypeId)).size).toBe(4);
              for (const request of all) {
                const law = laws.get(request.lawTypeId)!;
                expect(request.lawName).toBe(law.name);
                expect(request.policyOptionName).toBe(
                  law.policyOptions.find((o) => o.id === request.policyOptionId)?.name
                );
                expect(request.lawName + request.policyOptionName).not.toMatch(/[\u2013\u2014]/);
              }
            }
          }
        }
      }
    }
  );

  it("gives the same group different regional priorities with authored local emphasis", () => {
    const primary = (cc: string, region: string, group: string) =>
      resolveLegislativePriorities(cc, region, group, laws)!.primary.lawTypeId;
    expect(primary("US", "CA", "age:young")).toBe("us_state_housing");
    expect(primary("US", "MI", "age:young")).toBe("us_state_labor");
    expect(primary("UK", "LON", "education:degree_plus")).toBe("uk_regional_housing_development");
    expect(primary("UK", "SCO", "education:degree_plus")).toBe("uk_tuition_fees");
    expect(primary("JP", "KAN", "age:senior")).toBe("jp_pension");
    expect(primary("JP", "SHI", "age:senior")).toBe("jp_elder_care");
  });

  it("distinguishes groups in the same region", () => {
    const young = resolveLegislativePriorities("US", "CA", "age:young", laws)!;
    const senior = resolveLegislativePriorities("US", "CA", "age:senior", laws)!;
    const rich = resolveLegislativePriorities("US", "CA", "wealth:high", laws)!;
    expect(young.primary.lawTypeId).toBe("us_state_housing");
    expect(senior.primary.lawTypeId).toBe("us_social_security");
    expect(rich.primary.policyOptionName).toBe("5%");
  });

  it("is deterministic, case tolerant for country/region and independent of catalog order", () => {
    const reversed = new Map(
      [...laws]
        .reverse()
        .map(([id, law]) => [id, { ...law, policyOptions: [...law.policyOptions].reverse() }])
    );
    expect(resolveLegislativePriorities("us", "ca", "age:young", reversed)).toEqual(
      resolveLegislativePriorities("US", "CA", "age:young", laws)
    );
  });

  it("does not invent requests for unsupported countries, regions or dimensions", () => {
    expect(resolveLegislativePriorities("DE", "BE", "age:young", laws)).toBeNull();
    expect(resolveLegislativePriorities("US", "UNKNOWN", "age:young", laws)).toBeNull();
    expect(resolveLegislativePriorities("JP", "KAN", "urbanization:urban", laws)).toBeNull();
    expect(resolveLegislativePriorities("US", "CA", "age:unknown", laws)).toBeNull();
  });

  it("fails explicitly if an authored law or exact level disappears", () => {
    expect(() => resolveLegislativePriorities("US", "CA", "age:young", new Map())).toThrow(
      "Invalid legislative priority"
    );
    const changed = new Map(laws);
    changed.set("us_state_housing", { ...laws.get("us_state_housing")!, policyOptions: [] });
    expect(() => resolveLegislativePriorities("US", "CA", "age:young", changed)).toThrow(
      "Invalid legislative priority"
    );
  });
});
