import { describe, expect, it } from "vitest";
import {
  COUNTRY_CAP,
  fadeFactor,
  lossTerm,
  marketAdjustmentApproval,
  unemploymentTerm,
} from "./approvalRules";

describe("market adjustment approval terms", () => {
  it("loss term starts at 40 percent and caps at -2", () => {
    expect(lossTerm(0.4)).toBeCloseTo(0, 10);
    expect(lossTerm(0.3)).toBeCloseTo(0, 10);
    expect(lossTerm(0.55)).toBeCloseTo(-0.6, 10);
    expect(lossTerm(0.9)).toBe(-2);
    expect(lossTerm(1)).toBe(-2);
  });

  it("unemployment term is half a point per percentage point and caps at -2", () => {
    expect(unemploymentTerm(0)).toBeCloseTo(0, 10);
    expect(unemploymentTerm(-3)).toBeCloseTo(0, 10);
    expect(unemploymentTerm(2)).toBeCloseTo(-1, 10);
    expect(unemploymentTerm(4)).toBe(-2);
    expect(unemploymentTerm(10)).toBe(-2);
  });

  it("missing readings cost nothing", () => {
    expect(lossTerm(undefined)).toBe(0);
    expect(unemploymentTerm(null)).toBe(0);
    expect(unemploymentTerm(Number.NaN)).toBe(0);
  });
});

describe("marketAdjustmentApproval", () => {
  const open = { turnsSinceClose: null };

  it("adds the two terms while the event is open", () => {
    const out = marketAdjustmentApproval({
      lossShare: 0.7,
      unemploymentRise: 2,
      unemploymentEnabled: true,
      ...open,
    });
    // loss -1.2, unemployment -1.0
    expect(out.approval).toBe(-2.2);
  });

  it("holds the unemployment term at zero until it is enabled", () => {
    const out = marketAdjustmentApproval({
      lossShare: 0.7,
      unemploymentRise: 6,
      unemploymentEnabled: false,
      ...open,
    });
    expect(out.unemployment).toBe(0);
    expect(out.approval).toBe(-1.2);
  });

  it("is capped at -4 per country", () => {
    const out = marketAdjustmentApproval({
      lossShare: 1,
      unemploymentRise: 20,
      unemploymentEnabled: true,
      ...open,
    });
    expect(out.approval).toBe(-COUNTRY_CAP);
  });

  it("fades linearly to zero over 12 turns after the event closes", () => {
    const base = { lossShare: 0.9, unemploymentRise: 4, unemploymentEnabled: true };
    expect(marketAdjustmentApproval({ ...base, turnsSinceClose: 0 }).approval).toBe(-4);
    expect(marketAdjustmentApproval({ ...base, turnsSinceClose: 6 }).approval).toBe(-2);
    expect(marketAdjustmentApproval({ ...base, turnsSinceClose: 12 }).approval).toBe(0);
    expect(marketAdjustmentApproval({ ...base, turnsSinceClose: 40 }).approval).toBe(0);
    expect(fadeFactor(3)).toBeCloseTo(0.75, 10);
  });

  it("never produces a bonus", () => {
    const out = marketAdjustmentApproval({
      lossShare: 0.1,
      unemploymentRise: -5,
      unemploymentEnabled: true,
      ...open,
    });
    expect(out.approval).toBe(0);
  });
});
