import { describe, it, expect } from "vitest";
import { fx } from "@/lib/crises/templateHelpers";
import type { CrisisEffect } from "@/lib/db/types/crisis";
import { describeCrisisEffect } from "./effectDisplay";

const base: CrisisEffect = {
  effectType: "flat",
  targetType: "metric",
  metricCategory: null,
  metricField: null,
  sectorType: null,
  strategyId: null,
  value: 0,
  label: "",
};

describe("describeCrisisEffect", () => {
  it("shows a property-value hit as a percent loss, not as flavour prose in pp", () => {
    const effect = fx("flat", "metric", "economy", "housing", -0.012, "Wildfires destroy homes");
    const view = describeCrisisEffect(effect);
    expect(view.target).toBe("Property values");
    expect(view.amount).toBe("-1.2%");
    expect(view.cadence).toBe("once");
    expect(view.tone).toBe("bad");
    expect(view.detail).toBe("Wildfires destroy homes");
    expect(view.text).not.toContain("pp");
    expect(view.text).not.toContain("destroy");
  });

  it("uses percentage points for a percent metric and marks per-turn cadence", () => {
    const effect = fx("tick", "metric", "economy", "gdp", -0.025, "GDP contraction");
    const view = describeCrisisEffect(effect);
    expect(view.amount).toBe("-0.75 pp");
    expect(view.cadence).toBe("per turn, fading");
  });

  it("reads a rise in a lower-is-better metric as bad", () => {
    const effect = fx("tick", "metric", "economy", "unemployment", 0.02, "Layoffs");
    expect(describeCrisisEffect(effect).tone).toBe("bad");
    expect(describeCrisisEffect(effect).amount).toBe("+0.6 pp");
  });

  it("shows gdpLoss as a share of GDP, with money when the base is known", () => {
    const effect: CrisisEffect = { ...base, targetType: "gdpLoss", value: 0.03, label: "Damage" };
    expect(describeCrisisEffect(effect).amount).toBe("-3% of GDP");
    const withMoney = describeCrisisEffect(effect, {
      gdpAmount: 2_000_000_000,
      formatCurrency: (n) => `$${n / 1_000_000}M`,
    });
    expect(withMoney.amount).toBe("-3% of GDP ($60M)");
    expect(withMoney.cadence).toBe("once");
  });

  it("labels approval in points and inflation in percentage points", () => {
    const approval = fx("tick", "approval", "government", "overall", -0.04, "Erosion");
    expect(describeCrisisEffect(approval)).toMatchObject({
      target: "Government Approval",
      amount: "-1.2 pts",
      tone: "bad",
    });
    const inflation: CrisisEffect = { ...base, targetType: "inflation", value: 2, label: "x" };
    expect(describeCrisisEffect(inflation)).toMatchObject({
      target: "Inflation Rate",
      amount: "+2 pp",
      tone: "bad",
    });
  });

  it("labels a margin hit by sector, and a physical halt as lost output", () => {
    const margin: CrisisEffect = {
      ...base,
      targetType: "profitMargin",
      sectorType: "manufacturing",
      value: -7,
      label: "Credit freeze",
    };
    expect(describeCrisisEffect(margin)).toMatchObject({
      target: "Manufacturing Profit Margin",
      amount: "-7 pp",
    });
    const halt = describeCrisisEffect({ ...margin, physicality: "physical" });
    expect(halt.target).toBe("Manufacturing production");
    expect(halt.amount).toBe("-7% output");
  });

  it("shows a character stat as a loss whatever the stored sign", () => {
    const stat: CrisisEffect = {
      ...base,
      targetType: "stat",
      statKey: "charisma",
      value: 1,
      label: "Shaken",
    };
    expect(describeCrisisEffect(stat)).toMatchObject({
      target: "Charisma",
      amount: "-1 pts",
      tone: "bad",
    });
  });

  it("marks a decaying margin hit as fading and a flat one as once", () => {
    const decay: CrisisEffect = {
      ...base,
      effectType: "decay",
      targetType: "profitMargin",
      value: -6,
      label: "Slump",
    };
    expect(describeCrisisEffect(decay).cadence).toBe("fading");
    expect(describeCrisisEffect({ ...decay, effectType: "flat" }).cadence).toBe("once");
  });

  it("keeps the template prose as detail and never as the label", () => {
    const effect = fx(
      "tick",
      "metric",
      "economy",
      "unemployment",
      0.02,
      "Unemployment from bank failures"
    );
    const view = describeCrisisEffect(effect);
    expect(view.target).not.toContain("bank failures");
    expect(view.detail).toBe("Unemployment from bank failures");
  });

  it("shows commercial property in percent of baseline too", () => {
    const effect: CrisisEffect = {
      ...base,
      effectType: "tick",
      metricCategory: "economic",
      metricField: "commercialValueIndex",
      value: -0.6,
      label: "x",
    };
    expect(describeCrisisEffect(effect)).toMatchObject({
      target: "Commercial property values",
      amount: "-0.6%",
      cadence: "per turn, fading",
    });
  });
});
