import { describe, expect, it } from "vitest";
import { MARKET_ADJUSTMENT_TEMPLATE, MARKET_ADJUSTMENT_TEMPLATE_KEY } from "./template";
import { ALL_CRISIS_TEMPLATES } from "../templates";

describe("market adjustment template", () => {
  it("is registered with the auto-spawn templates", () => {
    expect(ALL_CRISIS_TEMPLATES[MARKET_ADJUSTMENT_TEMPLATE_KEY]).toBeDefined();
  });

  it("fires on measured loss share and shrinking output, per country", () => {
    const trig = MARKET_ADJUSTMENT_TEMPLATE.autoTrigger;
    expect(trig?.kind).toBe("condition");
    if (trig?.kind !== "condition") return;
    expect(trig.condition.all.map((c) => c.metric).sort()).toEqual(["gdpGrowth", "lossShare"]);
    // Both clauses need persistence and hysteresis, so one bad turn cannot fire it
    // and the event cannot re-arm on the edge of its own threshold.
    for (const clause of trig.condition.all) {
      expect(clause.consecutiveTurns).toBeGreaterThanOrEqual(3);
      expect(clause.clearMargin).toBeGreaterThan(0);
    }
    expect(MARKET_ADJUSTMENT_TEMPLATE.scope).toBe("country");
  });

  it("stacks no effects of its own, anywhere", () => {
    expect(MARKET_ADJUSTMENT_TEMPLATE.effects).toEqual([]);
    for (const node of MARKET_ADJUSTMENT_TEMPLATE.interactionDefinition?.decisionTree ?? []) {
      expect(node.outcomeEffects ?? []).toEqual([]);
      for (const option of node.options ?? []) {
        expect(option.effects).toEqual([]);
        // No promised shortening: the end is measured, not bought.
        expect(option.durationReductionTurns).toBeUndefined();
      }
    }
  });

  it("puts real treasury money behind its transfer option", () => {
    const options =
      MARKET_ADJUSTMENT_TEMPLATE.interactionDefinition?.decisionTree.flatMap(
        (n) => n.options ?? []
      ) ?? [];
    const transfer = options.find((o) => o.optionId === "household_transfer");
    expect(transfer?.action).toEqual({ kind: "financialCrisisResponse", response: "stimulus" });
    expect(transfer?.treasuryCostPctGdp).toBeGreaterThan(0);
  });
});
