import { describe, expect, it } from "vitest";
import { getEffectiveStrategyRates, getStrategy } from "./sectorStrategies";
import { DEFAULT_DEMAND_1991 } from "./sectorStrategyDefinitions1991";
import { SECTOR_STRATEGIES } from "./sectorStrategyDefinitions";
import {
  ADVERTISING_INPUT_STANDARD_1991_DEMAND,
  ADVERTISING_INPUT_VARIANT_DEMAND,
} from "./sectorStrategyAdvertisingOverlay";

describe("advertising input overlay", () => {
  it("leaves the live recipes untouched unless asked for", () => {
    for (const [type, overlay] of Object.entries(ADVERTISING_INPUT_STANDARD_1991_DEMAND)) {
      const plain = getStrategy(type, "standard", "1991-default");
      const table =
        DEFAULT_DEMAND_1991[type as keyof typeof DEFAULT_DEMAND_1991] ??
        SECTOR_STRATEGIES[type as keyof typeof SECTOR_STRATEGIES].find((s) => s.id === "standard")
          ?.demand;
      expect(plain.demand).toEqual(table);
      expect(plain.demand).not.toEqual(overlay);
    }
  });

  it("replaces each touched recipe in full when asked for", () => {
    for (const [type, demand] of Object.entries(ADVERTISING_INPUT_STANDARD_1991_DEMAND)) {
      const s = getStrategy(type, "standard", "1991-default", { advertisingInput: true });
      expect(s.demand).toEqual(demand);
      expect(s.demand.advertising).toBeGreaterThanOrEqual(0.07);
    }
    for (const [type, ids] of Object.entries(ADVERTISING_INPUT_VARIANT_DEMAND))
      for (const [id, demand] of Object.entries(ids)) {
        const s = getStrategy(type, id, "1991-default", { advertisingInput: true });
        expect(s.demand).toEqual(demand);
        expect(s.demand.advertising).toBeGreaterThanOrEqual(0.07);
      }
  });

  it("flows through effective rates", () => {
    const on = getEffectiveStrategyRates(
      "agriculture",
      "standard",
      null,
      null,
      10,
      null,
      "1991-default",
      null,
      { advertisingInput: true }
    );
    expect(on.demand).toEqual(ADVERTISING_INPUT_STANDARD_1991_DEMAND.agriculture);
    const off = getEffectiveStrategyRates(
      "agriculture",
      "standard",
      null,
      null,
      10,
      null,
      "1991-default"
    );
    expect(off.demand).not.toEqual(ADVERTISING_INPUT_STANDARD_1991_DEMAND.agriculture);
  });
});
