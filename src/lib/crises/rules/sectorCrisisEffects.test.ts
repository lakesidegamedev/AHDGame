import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { buildMarketContext } from "@/lib/market/marketContext";
import { sectorCrisisEffects } from "./sectorCrisisEffects";

function crisis(name: string, value: number, physicality: "financial" | "physical") {
  return {
    _id: new ObjectId(),
    name,
    startTurn: 10,
    durationTurns: 24,
    regionIds: ["test"],
    effects: [
      {
        effectType: "decay" as const,
        targetType: "profitMargin" as const,
        metricCategory: null,
        metricField: null,
        sectorType: "retail",
        strategyId: null,
        label: name,
        value,
        physicality,
      },
    ],
  };
}

describe("sector crisis effects", () => {
  const market = buildMarketContext("plants", { rampTurns: 24 });
  const sector = { sectorType: "retail", plantsStartTurn: 10 };
  const crises = [crisis("Panic", -20, "financial"), crisis("Blackout", -24, "physical")];

  it("reconciles the named rows to the margin and output totals during the plants ramp", () => {
    const total = sectorCrisisEffects(crises, sector, 22, market);
    expect(total.rows).toMatchObject([
      { name: "Panic", marginPoints: -10, outputPercent: 0 },
      { name: "Blackout", marginPoints: -6, outputPercent: -6 },
    ]);
    expect(total.marginPoints).toBe(total.rows.reduce((sum, row) => sum + row.marginPoints, 0));
    expect(total.outputPercent).toBeCloseTo(
      total.rows.reduce((sum, row) => sum + row.outputPercent, 0) + total.outputFloor
    );
  });

  it("accounts for the output floor when two cuts would lower production below zero", () => {
    const total = sectorCrisisEffects(
      [crisis("Blackout", -80, "physical"), crisis("Closure", -80, "physical")],
      { ...sector, plantsStartTurn: 1 },
      10,
      buildMarketContext("plants", { rampTurns: 1 })
    );
    expect(total.outputPercent).toBe(-100);
    expect(total.outputFloor).toBe(60);
    expect(total.rows.reduce((sum, row) => sum + row.outputPercent, 0) + total.outputFloor).toBe(
      total.outputPercent
    );
  });
});
