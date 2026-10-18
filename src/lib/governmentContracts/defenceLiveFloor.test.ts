import { describe, it, expect } from "vitest";
import { LOT_COST_SHARE } from "@/lib/military/arsenal";
import { JP_MILITARY_SCALE } from "@/lib/countries/jp/institutionsFacts";
import { LOT_COST_INDEX_MAX } from "@/lib/military/defenceLotEconomics";
import { NOMINAL_PRICE_RATIOS } from "@/lib/military/defencePriceRatios";
import { defenceLiveLotFloor, suggestedDefenceMaximumPricePerLot } from "./defenceLiveFloor";

/** Live JP federalBudget.gdp from ticket 1617, turn ~287. */
const JP_GDP = 568_386_963_509_097.4;
const JP_LOT_PRICE = Math.max(1, Math.round(JP_GDP * LOT_COST_SHARE * JP_MILITARY_SCALE));

describe("defenceLiveLotFloor", () => {
  it("matches the live JP lot price at yen GDP scale under nominal ratios", () => {
    expect(JP_LOT_PRICE).toBe(159_148_349_783);
    const floor = defenceLiveLotFloor({
      component: "naval",
      grade: 2,
      anchor: JP_LOT_PRICE,
      ratios: NOMINAL_PRICE_RATIOS,
    });
    expect(floor).toBeGreaterThan(0);
    expect(floor!).toBeLessThanOrEqual(JP_LOT_PRICE);
  });

  it("keeps a graded yen floor finite and at or below the graded anchor ceiling", () => {
    const floor = defenceLiveLotFloor({
      component: "naval",
      grade: 2,
      anchor: JP_LOT_PRICE,
      ratios: NOMINAL_PRICE_RATIOS,
    })!;
    const suggested = suggestedDefenceMaximumPricePerLot({
      anchor: JP_LOT_PRICE,
      grade: 2,
      liveFloor: floor,
    });
    expect(suggested).toBe(JP_LOT_PRICE);
    expect(suggested!).toBeGreaterThanOrEqual(floor);
  });

  it("raises the publish default to the live floor when the floor exceeds the graded anchor", () => {
    const stressedFloor = Math.ceil(JP_LOT_PRICE * LOT_COST_INDEX_MAX);
    const suggested = suggestedDefenceMaximumPricePerLot({
      anchor: JP_LOT_PRICE,
      grade: 2,
      liveFloor: stressedFloor,
    });
    expect(suggested).toBe(stressedFloor);
  });

  it("returns null for an unusable anchor", () => {
    expect(
      defenceLiveLotFloor({
        component: "naval",
        grade: 2,
        anchor: 0,
        ratios: NOMINAL_PRICE_RATIOS,
      })
    ).toBeNull();
    expect(suggestedDefenceMaximumPricePerLot({ anchor: -1, grade: 2 })).toBeNull();
  });
});
