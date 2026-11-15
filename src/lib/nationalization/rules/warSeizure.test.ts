import { describe, expect, it } from "vitest";
import type { CountryId } from "@/lib/constants/countries";
import {
  evaluateWarSeizure,
  restitutionPlan,
  wartimePoliticalFactor,
  warSeizureTension,
  type WarSeizureEligibilityInput,
  type WarSeizureRefusal,
} from "./warSeizure";

/**
 * A valid order: a government at war with an enemy that holds domestic assets,
 * with no cooldown and nothing ordered yet this turn.
 */
function input(overrides: Partial<WarSeizureEligibilityInput> = {}): WarSeizureEligibilityInput {
  return {
    takerCountryId: "US" as CountryId,
    ownerCountryId: "JP" as CountryId,
    takerHasGovernment: true,
    relation: "enemy",
    hasDomesticSectors: true,
    alreadyOrderedThisTurn: false,
    cooldownUntilTurn: null,
    currentTurn: 500,
    ...overrides,
  };
}

describe("evaluateWarSeizure", () => {
  it("allows a valid order", () => {
    expect(evaluateWarSeizure(input())).toEqual({ eligible: true, reason: "ok" });
  });

  /**
   * The power is symmetric and general. These pairs are driven through the same
   * fixture on purpose: if anything ever keys on a country or a direction, one
   * of these rows changes and this test fails.
   */
  it.each([
    ["US", "JP"],
    ["JP", "US"],
    ["UK", "DE"],
    ["RU", "CN"],
  ])("treats %s taking from %s exactly like every other pair", (taker, owner) => {
    const countries = {
      takerCountryId: taker as CountryId,
      ownerCountryId: owner as CountryId,
    };
    expect(evaluateWarSeizure(input(countries))).toEqual({ eligible: true, reason: "ok" });
    // The same pair, one side over, must never be a target. Both codes are
    // load-bearing here, and every row answers identically.
    expect(evaluateWarSeizure(input({ ...countries, relation: "co-belligerent" }))).toEqual({
      eligible: false,
      reason: "not-an-enemy",
    });
  });

  it("refuses a country with no government", () => {
    expect(evaluateWarSeizure(input({ takerHasGovernment: false }))).toEqual({
      eligible: false,
      reason: "no-government",
    });
  });

  it("refuses a country naming itself", () => {
    expect(
      evaluateWarSeizure(
        input({ takerCountryId: "US" as CountryId, ownerCountryId: "US" as CountryId })
      )
    ).toEqual({ eligible: false, reason: "same-country" });
  });

  it("refuses an owner the taker is not at war with", () => {
    expect(evaluateWarSeizure(input({ relation: "not-at-war" }))).toEqual({
      eligible: false,
      reason: "not-at-war",
    });
  });

  it("refuses a co-belligerent even when it shares the enemy", () => {
    // At war, but on the taker's own side: the shape that looks valid from the
    // outside and must never become a target.
    expect(evaluateWarSeizure(input({ relation: "co-belligerent" }))).toEqual({
      eligible: false,
      reason: "not-an-enemy",
    });
  });

  it("reports the co-belligerent refusal before the missing-asset one", () => {
    expect(
      evaluateWarSeizure(input({ relation: "co-belligerent", hasDomesticSectors: false }))
    ).toEqual({ eligible: false, reason: "not-an-enemy" });
  });

  it("allows the order on the cooldown turn itself and refuses the turn before", () => {
    expect(evaluateWarSeizure(input({ currentTurn: 500, cooldownUntilTurn: 500 }))).toEqual({
      eligible: true,
      reason: "ok",
    });
    expect(evaluateWarSeizure(input({ currentTurn: 499, cooldownUntilTurn: 500 }))).toEqual({
      eligible: false,
      reason: "cooldown",
    });
  });

  it("refuses a second order in the same turn", () => {
    expect(evaluateWarSeizure(input({ alreadyOrderedThisTurn: true }))).toEqual({
      eligible: false,
      reason: "already-ordered",
    });
  });

  it("refuses when the enemy holds nothing domestic", () => {
    expect(evaluateWarSeizure(input({ hasDomesticSectors: false }))).toEqual({
      eligible: false,
      reason: "no-domestic-assets",
    });
  });

  it("checks the war before the turn limits", () => {
    expect(
      evaluateWarSeizure(input({ relation: "not-at-war", alreadyOrderedThisTurn: true }))
    ).toEqual({ eligible: false, reason: "not-at-war" });
  });

  /**
   * Every adjacent pair in the documented order, each case setting up two
   * failures at once and expecting the earlier one. Reordering the checks in
   * `evaluateWarSeizure` fails this table even when each reason still has a
   * passing single-failure test.
   */
  const precedence: Array<[string, Partial<WarSeizureEligibilityInput>, WarSeizureRefusal]> = [
    [
      "no-government",
      { takerHasGovernment: false, ownerCountryId: "US" as CountryId },
      "no-government",
    ],
    ["same-country", { ownerCountryId: "US" as CountryId, relation: "not-at-war" }, "same-country"],
    ["not-at-war", { relation: "not-at-war", cooldownUntilTurn: 501 }, "not-at-war"],
    ["not-an-enemy", { relation: "co-belligerent", cooldownUntilTurn: 501 }, "not-an-enemy"],
    ["cooldown", { cooldownUntilTurn: 501, alreadyOrderedThisTurn: true }, "cooldown"],
    [
      "already-ordered",
      { alreadyOrderedThisTurn: true, hasDomesticSectors: false },
      "already-ordered",
    ],
  ];

  it.each(precedence)(
    "refuses for %s before the next reason in the order",
    (_name, overrides, reason) => {
      expect(evaluateWarSeizure(input(overrides))).toEqual({ eligible: false, reason });
    }
  );
});

describe("warSeizureTension", () => {
  it("sums the tier delta across the assets taken", () => {
    expect(warSeizureTension(1, "fair")).toBe(0.5);
    expect(warSeizureTension(1, "discounted")).toBe(1.5);
    expect(warSeizureTension(1, "seizure")).toBe(3);
    expect(warSeizureTension(4, "seizure")).toBe(12);
  });

  it("adds nothing for an empty order", () => {
    expect(warSeizureTension(0, "seizure")).toBe(0);
    expect(warSeizureTension(-3, "seizure")).toBe(0);
    expect(warSeizureTension(Number.NaN, "seizure")).toBe(0);
  });

  it("adds nothing for a non-finite asset count", () => {
    expect(warSeizureTension(Number.POSITIVE_INFINITY, "seizure")).toBe(0);
    expect(warSeizureTension(Number.NEGATIVE_INFINITY, "fair")).toBe(0);
  });

  it("floors a fractional asset count rather than paying for a partial asset", () => {
    expect(warSeizureTension(2.9, "seizure")).toBe(6);
  });
});

describe("wartimePoliticalFactor", () => {
  it("shrinks the domestic cost for an enemy target", () => {
    expect(wartimePoliticalFactor("enemy")).toBe(0.35);
  });

  it("leaves the cost alone for a co-belligerent", () => {
    // The discount follows the eligibility answer, not a bare "at war" flag: a
    // co-belligerent is never a target, so it never gets the discount either.
    expect(wartimePoliticalFactor("co-belligerent")).toBe(1);
  });

  it("leaves the cost alone when there is no war", () => {
    expect(wartimePoliticalFactor("not-at-war")).toBe(1);
  });
});

describe("restitutionPlan", () => {
  it("returns the asset in kind when the owner survives", () => {
    expect(
      restitutionPlan({
        sectorStillExists: true,
        heldByTaker: true,
        ownerCorporationExists: true,
        valuationAnchor: 1_000_000,
      })
    ).toEqual({ kind: "return" });
  });

  it("prefers a return even when a valuation is recorded", () => {
    expect(
      restitutionPlan({
        sectorStillExists: true,
        heldByTaker: true,
        ownerCorporationExists: true,
        valuationAnchor: 50_000_000,
      })
    ).toEqual({ kind: "return" });
  });

  it("carries the recorded valuation as unsettled when the owner is gone", () => {
    // Not a payment. The anchor is pre-tier and pre-premium, so a premium would
    // show up here as a different number, and the kind says the settlement rule
    // is the owner's decision rather than this helper's default.
    expect(
      restitutionPlan({
        sectorStillExists: true,
        heldByTaker: true,
        ownerCorporationExists: false,
        valuationAnchor: 2_000_000,
      })
    ).toEqual({ kind: "unsettled", amountAnchor: 2_000_000 });
  });

  it("never carries a negative valuation", () => {
    expect(
      restitutionPlan({
        sectorStillExists: true,
        heldByTaker: true,
        ownerCorporationExists: false,
        valuationAnchor: -5,
      })
    ).toEqual({ kind: "unsettled", amountAnchor: 0 });
  });

  it("skips a sector that no longer exists, even with a live owner", () => {
    expect(
      restitutionPlan({
        sectorStillExists: false,
        heldByTaker: true,
        ownerCorporationExists: true,
        valuationAnchor: 1,
      })
    ).toEqual({ kind: "skip", reason: "sector-gone" });
  });

  it("never carries a non-finite valuation", () => {
    for (const valuationAnchor of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(
        restitutionPlan({
          sectorStillExists: true,
          heldByTaker: true,
          ownerCorporationExists: false,
          valuationAnchor,
        })
      ).toEqual({ kind: "unsettled", amountAnchor: 0 });
    }
  });

  it("skips a gone sector even when the owner is gone too", () => {
    // The skip must win over compensation: there is nothing to hand back, so no
    // payment is owed for an asset that no longer exists.
    expect(
      restitutionPlan({
        sectorStillExists: false,
        heldByTaker: true,
        ownerCorporationExists: false,
        valuationAnchor: 5_000_000,
      })
    ).toEqual({ kind: "skip", reason: "sector-gone" });
  });

  it("skips an asset the taker no longer holds", () => {
    expect(
      restitutionPlan({
        sectorStillExists: true,
        heldByTaker: false,
        ownerCorporationExists: true,
        valuationAnchor: 1,
      })
    ).toEqual({ kind: "skip", reason: "not-held-by-taker" });
  });
});
