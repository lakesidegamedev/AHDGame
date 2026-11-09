import { describe, expect, it } from "vitest";
import { jpLegislationTypes } from "./jpLegislationTypes";
import { calculateDemographicShiftsByTarget } from "@/lib/demographicEffects";
import { turnoutTargetIdsForCountry } from "@/lib/demographics/turnoutTargets";
import type { LegislationType } from "@/lib/db/types/legislation";
import type { ActivePolicy } from "@/lib/policyEffects";

const typeMap = new Map(jpLegislationTypes.map((t) => [t._id, t]));
const hasScores = (t: LegislationType) =>
  (t.policyOptions ?? []).some((o) => o.economic !== 0 || o.social !== 0);

function policyFor(type: LegislationType, optionIndex: number, scope: number): ActivePolicy {
  const o = type.policyOptions![optionIndex]!;
  return {
    legislationTypeId: type._id,
    economic: o.economic,
    social: o.social,
    scopeMultiplier: scope,
  } as ActivePolicy;
}

describe("JP lean effects", () => {
  it("give every law with non-zero option scores at least one lean effect", () => {
    const missing = jpLegislationTypes
      .filter((t) => hasScores(t) && !(t.demographicEffects ?? []).length)
      .map((t) => t._id);
    expect(missing).toEqual([]);
  });

  it("only target Japanese Layer-1 buckets on the lean channels", () => {
    const valid = turnoutTargetIdsForCountry("JP");
    const bad = jpLegislationTypes.flatMap((t) =>
      (t.demographicEffects ?? [])
        .filter(
          (e) =>
            !valid.has(`${e.dim}:${e.bucket}`) ||
            (e.target !== "economicLean" && e.target !== "socialLean")
        )
        .map((e) => `${t._id}: ${e.dim}:${e.bucket}:${e.target}`)
    );
    expect(bad).toEqual([]);
  });

  it("moves an economic regional law left for a left option, right for a right one, none for centre", () => {
    const type = typeMap.get("jp_regional_economic_development")!;
    const opts = type.policyOptions!;
    const left = calculateDemographicShiftsByTarget([policyFor(type, 0, 1)], typeMap);
    const right = calculateDemographicShiftsByTarget(
      [policyFor(type, opts.length - 1, 1)],
      typeMap
    );
    const centre = calculateDemographicShiftsByTarget(
      [
        policyFor(
          type,
          opts.findIndex((o) => o.economic === 0),
          1
        ),
      ],
      typeMap
    );
    expect(opts[0]!.economic).toBeLessThan(0);
    expect(left.economicLean["income:middle"]).toBeLessThan(0);
    expect(right.economicLean["income:middle"]).toBeGreaterThan(0);
    expect(Object.values(centre.economicLean).every((v) => v === 0)).toBe(true);
  });

  it("moves a social-only law through its social score", () => {
    const type = typeMap.get("jp_regional_policing")!;
    const opts = type.policyOptions!;
    expect(opts.every((o) => o.economic === 0)).toBe(true);
    const left = calculateDemographicShiftsByTarget([policyFor(type, 0, 1)], typeMap);
    const right = calculateDemographicShiftsByTarget(
      [policyFor(type, opts.length - 1, 1)],
      typeMap
    );
    expect(left.socialLean["age:senior"]).toBeLessThan(0);
    expect(right.socialLean["age:senior"]).toBeGreaterThan(0);
  });

  it("dilutes a national law by the 1/8 regional share", () => {
    const type = typeMap.get("jp_income_tax_rate")!;
    const national = calculateDemographicShiftsByTarget([policyFor(type, 0, 1 / 8)], typeMap);
    expect(national.economicLean["income:middle"]).toBeGreaterThan(0.002);
    expect(national.economicLean["income:middle"]).toBeLessThan(0.02);
  });
});
