import { bucketValuesToUnits } from "@/lib/demographics/granularElectorate";
import { calcEffectiveFavorability } from "@/lib/electionEngine/voteCalculations";
import { describe, expect, it } from "vitest";
import catalog from "../familyCatalog.json";
import {
  finalV2Voters,
  corporateTaxApproval,
  V2_FAMILY_APPROVAL_SPAN,
  v2EnactmentApproval,
  v2VotePosition,
  V2_POLITICAL_ROUTES,
} from "./voterReactions";
import {
  billPositionTargets,
  computeVoteShift,
  previewVoteShift,
} from "@/lib/legislature/rules/votePolicyShift";

const provision = { familyId: "L01", choice: "far_left", currentChoiceSnapshot: "center" } as const;
describe("v2 legislative voter reactions", () => {
  it("explicitly routes every catalog family and recognizes neutral positions", () => {
    expect(Object.keys(V2_POLITICAL_ROUTES).sort()).toEqual(catalog.map((f) => f.id).sort());
    for (const family of catalog) {
      const position = v2VotePosition({ familyId: family.id, choice: "center" });
      expect(position).not.toBeNull();
      expect(Object.values(billPositionTargets([position!]))).toEqual([0]);
    }
    expect(billPositionTargets([{ economic: 0 }])).toEqual({});
    expect(v2VotePosition({ familyId: "unknown", choice: "far_left" })).toBeNull();
    expect(v2VotePosition({ familyId: "L01", choice: "leave_to_states" })).toBeNull();
  });
  it.each(["US", "UK", "JP", "IE", "SCO", "WAL", "DE", "CN"])(
    "uses %s demographic buckets for every family",
    (country) => {
      for (const family of catalog) {
        const changes = v2EnactmentApproval([{ ...provision, familyId: family.id }], country);
        expect(Object.keys(changes).length, family.id).toBeGreaterThan(0);
        expect(Object.values(changes).every((v) => Math.abs(v) <= 10)).toBe(true);
        expect(
          v2EnactmentApproval([{ ...provision, familyId: family.id, choice: "center" }], country)
        ).toEqual({});
      }
    }
  );
  it.each(["US", "UK", "JP"])(
    "reaches %s election favorability through live bucket mapping",
    (country) => {
      const effects = v2EnactmentApproval([provision], country);
      const [bucket, amount] = Object.entries(effects)[0]!;
      const units = [
        {
          id: "synthetic-cell",
          share: 1,
          economicLean: 0,
          socialLean: 0,
          turnout: 60,
          bucketWeights: { [bucket]: 1 },
        },
      ];
      const forApproval = bucketValuesToUnits(effects, units)["synthetic-cell"]!;
      const againstApproval = bucketValuesToUnits(
        Object.fromEntries(Object.entries(effects).map(([key, value]) => [key, -value])),
        units
      )["synthetic-cell"]!;
      expect(forApproval).toBe(amount);
      expect(againstApproval).toBe(-amount);
      expect(calcEffectiveFavorability(50, forApproval)).toBe(50 + amount * 0.5);
      expect(calcEffectiveFavorability(50, againstApproval)).toBe(50 - amount * 0.5);
    }
  );

  it("bounds the combined demographic dimensions, including three-provision bills", () => {
    for (const country of ["US", "UK", "JP"]) {
      const impacts = v2EnactmentApproval([provision, provision, provision], country);
      const maxima: Record<string, number> = {};
      for (const [bucket, value] of Object.entries(impacts)) {
        const dimension = bucket.split(":")[0]!;
        maxima[dimension] = Math.max(maxima[dimension] ?? 0, Math.abs(value));
      }
      expect(Object.values(maxima).reduce((sum, v) => sum + v, 0)).toBeLessThanOrEqual(
        3 * V2_FAMILY_APPROVAL_SPAN
      );
    }
  });
  it.each(["US", "UK", "JP", "IE", "SCO", "WAL"])(
    "reverses and telescopes %s reactions without a policy-cycling reward",
    (country) => {
      for (const family of catalog) {
        const change = (
          from: "far_left" | "center_left" | "center",
          to: "far_left" | "center_left" | "center"
        ) =>
          v2EnactmentApproval(
            [{ familyId: family.id, choice: to, currentChoiceSnapshot: from }],
            country
          );
        const forward = change("center", "far_left"),
          reverse = change("far_left", "center");
        const first = change("center", "center_left"),
          second = change("center_left", "far_left");
        for (const key of new Set([
          ...Object.keys(forward),
          ...Object.keys(reverse),
          ...Object.keys(first),
          ...Object.keys(second),
        ])) {
          expect((forward[key] ?? 0) + (reverse[key] ?? 0), family.id).toBeCloseTo(0, 10);
          expect((first[key] ?? 0) + (second[key] ?? 0), family.id).toBeCloseTo(
            forward[key] ?? 0,
            10
          );
        }
      }
    }
  );
  it.each(["US", "UK", "JP", "IE", "SCO", "WAL"])(
    "rewards lower-income %s households for targeted relief",
    (country) => {
      const effects = v2EnactmentApproval([{ ...provision, choice: "center_left" }], country);
      const dimension = country === "US" ? "wealth" : "income";
      expect(effects[`${dimension}:low`]).toBeGreaterThan(0);
      expect(effects[`${dimension}:middle`]).toBeGreaterThan(0);
      expect(effects[`${dimension}:high`]).toBeLessThan(0);
    }
  );
  it("distinguishes reproductive rights from general healthcare and childcare from retirement", () => {
    const healthcare = v2EnactmentApproval([{ ...provision, familyId: "L16" }], "UK");
    const reproductive = v2EnactmentApproval([{ ...provision, familyId: "L51" }], "UK");
    expect(healthcare["age:senior"]).toBeGreaterThan(0);
    expect(reproductive["age:senior"]).toBeLessThan(0);
    expect(reproductive["age:young"]).toBeGreaterThan(0);
    expect(reproductive["income:low"]).toBeUndefined();
    const childcare = v2EnactmentApproval([{ ...provision, familyId: "L38" }], "JP");
    expect(childcare["age:mid"]).toBeGreaterThan(0);
    expect(childcare["age:senior"]).toBeUndefined();
  });
  it.each(["income", "wealth"] as const)(
    "scales corporate tax reactions by rate change in %s buckets",
    (dimension) => {
      expect(corporateTaxApproval(30, 20, dimension)).toEqual({
        [`${dimension}:low`]: -1,
        [`${dimension}:middle`]: -0.8,
        [`${dimension}:high`]: 1.2,
      });
      const small = corporateTaxApproval(30, 29, dimension),
        large = corporateTaxApproval(30, 20, dimension),
        reverse = corporateTaxApproval(20, 30, dimension);
      for (const bucket of Object.keys(large)) {
        expect(large[bucket]).toBeCloseTo(small[bucket]! * 10, 10);
        expect(large[bucket]! + reverse[bucket]!).toBe(0);
      }
      expect(corporateTaxApproval(30, 30, dimension)).toEqual({});
      expect(() => corporateTaxApproval(NaN, 20, dimension)).toThrow();
      expect(() => corporateTaxApproval(30, 101, dimension)).toThrow();
    }
  );
  it("does not invent a policy distance for federalism choices", () => {
    expect(v2EnactmentApproval([{ ...provision, choice: "leave_to_states" }], "US")).toEqual({});
    expect(
      v2EnactmentApproval([{ ...provision, currentChoiceSnapshot: "leave_to_states" }], "US")
    ).toEqual({});
  });
  it("uses the last recorded ballot, including neutral override ballots, once per identity", () => {
    const char = "000000000000000000000001",
      npp = "000000000000000000000002";
    expect(
      finalV2Voters([
        { [char]: "for", [`npp_${npp}`]: "against", invalid: "for" },
        { [char]: "against" },
        { [char]: "abstain" },
      ])
    ).toEqual([{ id: npp, kind: "npp", vote: "against" }]);
  });
  it("repeated clicks and vote reversals preserve the one-bill movement limit", () => {
    const baseline = { economic: 1, social: 0 };
    const target = billPositionTargets([v2VotePosition(provision)!]);
    const first = computeVoteShift(baseline, target, "for");
    const current = { economic: baseline.economic + first.economic, social: 0 };
    const entry = { baseline, applied: first };
    expect(previewVoteShift(current, target, entry).aye).toEqual({ economic: 0, social: 0 });
    expect(computeVoteShift(baseline, target, "against").economic).toBe(0.25);
    expect(computeVoteShift(baseline, target, "abstain")).toEqual({ economic: 0, social: 0 });
    expect(computeVoteShift(baseline, { economic: 0 }, "for").economic).toBe(-0.25);
  });
});
