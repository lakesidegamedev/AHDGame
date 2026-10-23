import { describe, expect, it } from "vitest";
import {
  clampMechanicalLevel,
  foreignInvestmentRuleForLevel,
  MECHANICAL_LAW_COMPLIANCE_TURNS,
  SUBSIDIARY_CAP_BY_LEVEL,
} from "./rules";

describe("clampMechanicalLevel", () => {
  it("maps a non-number or NaN to level 0", () => {
    expect(clampMechanicalLevel(undefined)).toBe(0);
    expect(clampMechanicalLevel(null)).toBe(0);
    expect(clampMechanicalLevel("3")).toBe(0);
    expect(clampMechanicalLevel(Number.NaN)).toBe(0);
  });

  it("clamps a negative value to 0 and 9 to 4", () => {
    expect(clampMechanicalLevel(-3)).toBe(0);
    expect(clampMechanicalLevel(9)).toBe(4);
  });

  it("rounds to the nearest level", () => {
    expect(clampMechanicalLevel(2.6)).toBe(3);
  });

  it("passes every valid level through unchanged", () => {
    for (const level of [0, 1, 2, 3, 4] as const) {
      expect(clampMechanicalLevel(level)).toBe(level);
    }
  });
});

describe("SUBSIDIARY_CAP_BY_LEVEL", () => {
  it("has one cap per level", () => {
    expect(SUBSIDIARY_CAP_BY_LEVEL).toHaveLength(5);
  });

  it("has no cap at level 0", () => {
    expect(SUBSIDIARY_CAP_BY_LEVEL[0]).toBeNull();
  });

  it("strictly decreases from level 1 to level 4", () => {
    const caps = SUBSIDIARY_CAP_BY_LEVEL.slice(1) as number[];
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]).toBeLessThan(caps[i - 1]);
    }
  });
});

describe("foreignInvestmentRuleForLevel", () => {
  it("is open at level 0 and a ban at level 4", () => {
    expect(foreignInvestmentRuleForLevel(0)).toEqual({ kind: "open" });
    expect(foreignInvestmentRuleForLevel(4)).toEqual({ kind: "ban" });
  });

  it("tightens the industry cap from level 2 to level 3", () => {
    const level2 = foreignInvestmentRuleForLevel(2);
    const level3 = foreignInvestmentRuleForLevel(3);
    expect(level2.kind).toBe("cap");
    expect(level3.kind).toBe("cap");
    if (level2.kind !== "cap" || level3.kind !== "cap") return;
    expect(level3.maxIndustrySharePct).toBeLessThan(level2.maxIndustrySharePct);
  });
});

describe("MECHANICAL_LAW_COMPLIANCE_TURNS", () => {
  it("gives a group 48 turns to comply", () => {
    expect(MECHANICAL_LAW_COMPLIANCE_TURNS).toBe(48);
  });
});
