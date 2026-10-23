import { describe, expect, it } from "vitest";
import { LEGAL_STRUCTURES } from "@/lib/constants/legalStructures";
import {
  PASS_THROUGH_PHASE_IN_TURNS,
  S_CORP_MAX_HOLDERS,
  alreadyTaxedDistributionShare,
  blendedOwnerRate,
  corporateTaxMultiplierFor,
  legalStructureTaxLabel,
  passThroughOwnerTax,
  passThroughReformPhase,
  passThroughStatus,
} from "./passThroughTax";

const byId = (id: string) => LEGAL_STRUCTURES.find((s) => s.id === id)!;
const person = { characterId: "c" };
const privateOwned = { isPrivate: true, publicFloat: 0, shareholders: [person] };

describe("pass-through reform phase", () => {
  it("is 0 before the start, ramps over the window and holds at 1", () => {
    expect(passThroughReformPhase(10, undefined)).toBe(0);
    expect(passThroughReformPhase(9, 10)).toBe(0);
    expect(passThroughReformPhase(10, 10)).toBeCloseTo(1 / PASS_THROUGH_PHASE_IN_TURNS);
    expect(passThroughReformPhase(10 + PASS_THROUGH_PHASE_IN_TURNS - 1, 10)).toBe(1);
    expect(passThroughReformPhase(500, 10)).toBe(1);
    expect(passThroughReformPhase(Number.NaN, 10)).toBe(0);
  });
});

describe("pass-through status", () => {
  it("leaves standard and preferential forms alone", () => {
    expect(passThroughStatus(byId("us_c_corp"), privateOwned).mode).toBe("none");
  });
  it("taxes a privately held LLC through its owners", () => {
    expect(passThroughStatus(byId("us_llc"), privateOwned)).toEqual({ mode: "ownerFlowThrough" });
    expect(passThroughStatus(byId("uk_llp"), privateOwned).mode).toBe("ownerFlowThrough");
  });
  it("taxes a godo kaisha as a company", () => {
    expect(passThroughStatus(byId("jp_gk"), privateOwned)).toEqual({
      mode: "companyPhaseIn",
      reason: "taxedAsCompany",
    });
  });
  it("taxes a pass-through with publicly traded shares as a company", () => {
    expect(passThroughStatus(byId("us_llc"), { ...privateOwned, isPrivate: false }).reason).toBe(
      "listed"
    );
    expect(passThroughStatus(byId("us_llc"), { ...privateOwned, publicFloat: 5 }).reason).toBe(
      "listed"
    );
  });
  it("ends S-Corp treatment for non-individual or too many holders", () => {
    const sCorp = byId("us_s_corp");
    expect(passThroughStatus(sCorp, privateOwned).mode).toBe("ownerFlowThrough");
    expect(
      passThroughStatus(sCorp, { ...privateOwned, shareholders: [person, { corporationId: "p" }] })
        .reason
    ).toBe("sCorpIneligible");
    expect(
      passThroughStatus(sCorp, {
        ...privateOwned,
        shareholders: Array.from({ length: S_CORP_MAX_HOLDERS + 1 }, () => person),
      }).reason
    ).toBe("sCorpIneligible");
  });
});

describe("corporate tax multiplier", () => {
  it("keeps standard at 1 and owner flow-through at 0, and ramps company treatment", () => {
    expect(corporateTaxMultiplierFor(byId("us_c_corp"), 0.5, privateOwned)).toBe(1);
    expect(corporateTaxMultiplierFor(byId("us_llc"), 0.5, privateOwned)).toBe(0);
    expect(corporateTaxMultiplierFor(byId("jp_gk"), 0.5, privateOwned)).toBe(0.5);
    expect(corporateTaxMultiplierFor(byId("jp_gk"), 0, privateOwned)).toBe(0);
  });
});

describe("owner rate and tax", () => {
  const rates = {
    personalNationalPct: 40,
    personalStatePct: 5,
    corporateNationalPct: 30,
    corporateStatePct: 6,
  };
  it("weights personal and other holders by shares, float at the corporate rate", () => {
    const r = blendedOwnerRate([{ personal: true, shares: 60 }], 100, rates);
    expect(r.nationalPct).toBeCloseTo(0.6 * 40 + 0.4 * 30);
    expect(r.statePct).toBeCloseTo(0.6 * 5 + 0.4 * 6);
    expect(blendedOwnerRate([], 0, rates)).toEqual({ nationalPct: 30, statePct: 6 });
  });
  it("taxes all positive profit, scaled by the phase, never on a loss", () => {
    const split = { nationalPct: 40, statePct: 5 };
    expect(passThroughOwnerTax({ taxableProfit: 1000, phase: 1, rates: split })).toEqual({
      national: 400,
      state: 50,
    });
    expect(passThroughOwnerTax({ taxableProfit: 1000, phase: 0.5, rates: split }).national).toBe(
      200
    );
    expect(passThroughOwnerTax({ taxableProfit: -5, phase: 1, rates: split })).toEqual({
      national: 0,
      state: 0,
    });
  });
  it("caps a combined rate above 100%", () => {
    const t = passThroughOwnerTax({
      taxableProfit: 100,
      phase: 1,
      rates: { nationalPct: 90, statePct: 30 },
    });
    expect(t.national + t.state).toBeCloseTo(100);
  });
});

describe("distributions and labels", () => {
  it("exempts flow-through distributions by the phase only", () => {
    expect(alreadyTaxedDistributionShare(byId("us_llc"), 0.25, privateOwned)).toBe(0.25);
    expect(alreadyTaxedDistributionShare(byId("jp_gk"), 1, privateOwned)).toBe(0);
    expect(alreadyTaxedDistributionShare(byId("us_c_corp"), 1, privateOwned)).toBe(0);
  });
  it("describes the treatment players will see", () => {
    expect(legalStructureTaxLabel(byId("us_llc"), 0, privateOwned)).toMatch(/only on payouts/);
    expect(legalStructureTaxLabel(byId("us_llc"), 1, privateOwned)).toMatch(/all profit/);
    expect(
      legalStructureTaxLabel(byId("us_llc"), 1, { ...privateOwned, isPrivate: false })
    ).toMatch(/trade publicly/);
    expect(legalStructureTaxLabel(byId("us_c_corp"), 1)).toBe("standard tax");
  });
});
