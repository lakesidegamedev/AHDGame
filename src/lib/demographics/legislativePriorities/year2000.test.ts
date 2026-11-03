import { describe, expect, it } from "vitest";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import { getBucketProfileForRegion } from "../bucketProfile";
import { PRIORITY_COUNTRIES } from "./catalog";
import { YEAR_2000_PRIORITIES } from "./year2000";
import {
  resolveLegislativePriorities,
  priorityWorldContext,
  isPriorityTarget,
  type PriorityLaw,
} from "./rules";
import { withLegislativePriorities } from "./profile";

const laws = new Map<string, PriorityLaw>(
  legislationTypes.map((law) => [law._id, { ...law, policyOptions: law.policyOptions ?? [] }])
);
const requests = (
  cc: string,
  region: string,
  bucket: string,
  economicLean = 0,
  socialLean = 0,
  year = 2000
) => {
  const p = resolveLegislativePriorities(cc, region, bucket, laws, {
    year,
    economicLean,
    socialLean,
  })!;
  return [p.primary, ...p.secondary];
};

describe("year-2000 legislative calibration", () => {
  it("every authored level, including less frequent topics, is an existing country option", () => {
    for (const [cc, config] of Object.entries(YEAR_2000_PRIORITIES)) {
      for (const topic of Object.values(config.topics)) {
        const law = laws.get(topic.lawTypeId)!;
        expect(law.countryScope).toBe(cc.toLowerCase());
        for (const id of topic.levels)
          expect(
            law.policyOptions.some((o) => o.id === id),
            `${cc}/${id}`
          ).toBe(true);
      }
    }
  });
  it.each(["US", "UK", "JP"])(
    "%s: all regions, groups and lean combinations resolve four distinct valid laws",
    (cc) => {
      const config = YEAR_2000_PRIORITIES[cc];
      expect(Object.keys(config.regions).sort()).toEqual(
        Object.keys(PRIORITY_COUNTRIES[cc].regions).sort()
      );
      const region = Object.keys(config.regions)[0];
      expect(Object.keys(config.groups).sort()).toEqual(
        Object.keys(PRIORITY_COUNTRIES[cc].groups)
          .filter((group) => isPriorityTarget(cc, region, group))
          .sort()
      );
      for (const region of Object.keys(config.regions))
        for (const group of Object.keys(config.groups)) {
          for (const economic of [-3, 0, 3])
            for (const social of [-3, 0, 3]) {
              const all = requests(cc, region, group, economic, social);
              expect(new Set(all.map((p) => p.lawTypeId)).size, `${cc}/${region}/${group}`).toBe(4);
              for (const p of all) {
                expect(laws.get(p.lawTypeId)?.countryScope).toBe(cc.toLowerCase());
                expect(
                  laws.get(p.lawTypeId)?.policyOptions.some((o) => o.id === p.policyOptionId)
                ).toBe(true);
                expect(p.lawName + p.policyOptionName).not.toMatch(/[\u2013\u2014]/);
                expect(p.lawTypeId).not.toMatch(/minimum_wage/);
              }
            }
        }
    }
  );

  it("uses economic and social leans independently, bounded to authored issue levels", () => {
    const left = requests("US", "AL", "race:white", -3, -3);
    const economicRight = requests("US", "AL", "race:white", 3, -3);
    const socialRight = requests("US", "AL", "race:white", -3, 3);
    const health = (all: typeof left) =>
      all.find((p) => p.lawTypeId === "us_state_healthcare")!.policyOptionId;
    const crime = (all: typeof left) =>
      all.find((p) => p.lawTypeId === "us_state_policing")!.policyOptionId;
    expect(health(left)).not.toBe(health(economicRight));
    expect(health(left)).toBe(health(socialRight));
    expect(crime(left)).toBe(crime(economicRight));
    expect(crime(left)).not.toBe(crime(socialRight));
  });

  it("lets strong social interests enter the selected priorities in either direction", () => {
    const conservative = requests("US", "AL", "race:white", 0, 3);
    const progressive = requests("US", "AL", "race:white", 0, -3);
    expect(conservative.find((p) => p.lawTypeId === "us_reproductive_rights")?.policyOptionId).toBe(
      "reproductive_rights_opt_4"
    );
    expect(progressive.find((p) => p.lawTypeId === "us_reproductive_rights")?.policyOptionId).toBe(
      "reproductive_rights_opt_2"
    );
    expect(
      requests("US", "MT", "race:white", 0, 3).some((p) => p.lawTypeId === "us_gun_control")
    ).toBe(true);
  });

  it("preserves no-income-tax institutions and distinguishes Scotland from England", () => {
    const tax = requests("US", "WA", "wealth:high", 3).find(
      (p) => p.lawTypeId === "us_state_income_tax_rate"
    )!;
    expect(tax.policyOptionId).toBe("state_income_tax_rate_opt_0");
    for (const region of ["AK", "FL", "NH", "NV", "SD", "TN", "TX", "WA", "WY"]) {
      expect(
        requests("US", region, "wealth:high", 3).find(
          (p) => p.lawTypeId === "us_state_income_tax_rate"
        )!.policyOptionId
      ).toBe("state_income_tax_rate_opt_0");
    }
    expect(requests("UK", "SCO", "age:young")[0].policyOptionId).toBe("uk_tuition_fees_opt_0");
    expect(
      requests("UK", "SEE", "age:young").find((p) => p.lawTypeId === "uk_tuition_fees")
        ?.policyOptionId
    ).not.toBe("uk_tuition_fees_opt_0");
  });

  it("gives Hispanic groups schools and employment priorities with regional differences", () => {
    const florida = requests("US", "FL", "race:hispanic");
    const texas = requests("US", "TX", "race:hispanic");
    expect(florida[0].lawTypeId).toBe("us_state_education_funding");
    expect(texas[0].lawTypeId).toBe("us_state_education_funding");
    expect(florida.map((p) => p.lawTypeId)).not.toEqual(texas.map((p) => p.lawTypeId));
  });

  it("changes actual law sets for regional college and graduate interests, not only ordering", () => {
    const sets = (cc: string, group: string) =>
      new Set(
        Object.keys(YEAR_2000_PRIORITIES[cc].regions).map((region) =>
          requests(cc, region, group)
            .map((p) => p.lawTypeId)
            .sort()
            .join("|")
        )
      );
    expect(sets("US", "education:college").size).toBeGreaterThan(3);
    expect(sets("JP", "education:graduate").size).toBeGreaterThan(3);
  });

  it("prioritizes senior prescriptions, Japanese employment and graduate research without universal tuition", () => {
    expect(requests("US", "FL", "age:senior")[0].lawTypeId).toBe("us_drug_pricing_medicare");
    expect(requests("JP", "KAN", "age:young")[0].lawTypeId).toBe(
      "jp_regional_economic_development"
    );
    expect(requests("JP", "SHI", "age:senior")[0].lawTypeId).toBe("jp_elder_care");
    const graduate = requests("JP", "CHU", "education:graduate");
    expect(graduate.some((p) => p.lawTypeId === "jp_research_science")).toBe(true);
    expect(graduate.some((p) => p.lawTypeId === "jp_university_tuition")).toBe(false);
  });

  it("uses live context on the board without mutating demographic leans or the source profile", () => {
    const original = getBucketProfileForRegion("US", "WA", "1999-default", null, {
      year: 2000,
      startingYear: 1999,
    })!;
    const snapshot = structuredClone(original);
    const enriched = withLegislativePriorities(original, "US", "WA", 2000)!;
    const rich = enriched
      .find((s) => s.dim === "wealth")!
      .buckets.find((b) => b.id === "wealth:high")!;
    expect(rich.legislativePriorities).toEqual(
      resolveLegislativePriorities("US", "WA", rich.id, laws, {
        year: 2000,
        economicLean: rich.economicLean,
        socialLean: rich.socialLean,
      })
    );
    expect(original).toEqual(snapshot);
  });

  it("keeps older and later era defaults and handles malformed lean inputs deterministically", () => {
    for (const year of [1953, 1998, 2007, 2027]) {
      expect(requests("JP", "KAN", "age:young", 3, 3, year)).toEqual(
        requests("JP", "KAN", "age:young", -3, -3, year)
      );
    }
    expect(requests("JP", "KAN", "age:young", Number.NaN)).toEqual(
      requests("JP", "KAN", "age:young")
    );
    expect(requests("US", "AL", "race:white", 0, Number.POSITIVE_INFINITY)).toEqual(
      requests("US", "AL", "race:white")
    );
    const reverse = new Map(
      [...laws]
        .reverse()
        .map(([id, law]) => [id, { ...law, policyOptions: [...law.policyOptions].reverse() }])
    );
    expect(
      resolveLegislativePriorities("us", "wa", "wealth:high", reverse, {
        year: 2000,
        economicLean: 3,
      })
    ).toEqual(
      resolveLegislativePriorities("US", "WA", "wealth:high", laws, { year: 2000, economicLean: 3 })
    );
  });

  it("uses the world clock only when enabled, including worlds started in an earlier era", () => {
    const world = {
      preset: "1953-default",
      currentYear: 2000,
      startingYear: 1953,
      eraSystemEnabled: true,
    };
    expect(priorityWorldContext(world)).toEqual({
      yearContext: { year: 2000, startingYear: 1953 },
      priorityYear: 2000,
    });
    expect(priorityWorldContext({ ...world, eraSystemEnabled: false })).toEqual({
      yearContext: { year: null, startingYear: 1953 },
      priorityYear: 1953,
    });
    expect(priorityWorldContext({ ...world, currentYear: Number.NaN }).priorityYear).toBe(1953);
    expect(priorityWorldContext({ preset: "1999-default" }).priorityYear).toBe(1999);
  });
});
