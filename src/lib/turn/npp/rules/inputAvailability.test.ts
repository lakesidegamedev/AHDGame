import { describe, expect, it } from "vitest";
import type { CommodityType } from "@/lib/constants/commodities";
import {
  AI_MIN_INPUT_AVAILABILITY,
  inputCutRunShare,
  isInputStarved,
  recipeInputAvailability,
} from "./inputAvailability";

const fills =
  (map: Partial<Record<CommodityType, number>>) =>
  (commodity: CommodityType): number | null =>
    map[commodity] ?? null;

describe("recipeInputAvailability", () => {
  it("is the fill of the scarcest input", () => {
    expect(
      recipeInputAvailability(
        { fertilizers: 0.15, energy: 0.1, plastics: 0.05 },
        "WI",
        fills({ fertilizers: 0.3, energy: 1, plastics: 0.42 })
      )
    ).toBeCloseTo(0.3);
  });

  it("reads unknown inputs and zero rates as available", () => {
    expect(recipeInputAvailability({ energy: 0.1 }, "WI", fills({}))).toBe(1);
    expect(recipeInputAvailability({ fertilizers: 0 }, "WI", fills({ fertilizers: 0 }))).toBe(1);
    expect(recipeInputAvailability(undefined, "WI", fills({}))).toBe(1);
  });
});

describe("isInputStarved", () => {
  it("blocks below the floor only", () => {
    expect(isInputStarved(AI_MIN_INPUT_AVAILABILITY - 0.01)).toBe(true);
    expect(isInputStarved(AI_MIN_INPUT_AVAILABILITY)).toBe(false);
    expect(isInputStarved(null)).toBe(false);
    expect(isInputStarved(undefined)).toBe(false);
    expect(isInputStarved(Number.NaN)).toBe(false);
  });
});

describe("inputCutRunShare", () => {
  const receipt = { worldEpoch: "e1", billedRunShare: 0.3, runCutBy: ["inputs"] };

  it("reads an input-cut run from this funded world", () => {
    expect(inputCutRunShare(receipt, "e1")).toBeCloseTo(0.3);
  });

  it("ignores cash cuts, other worlds and legacy worlds", () => {
    expect(inputCutRunShare({ ...receipt, runCutBy: ["cash"] }, "e1")).toBeNull();
    expect(inputCutRunShare(receipt, "e2")).toBeNull();
    expect(inputCutRunShare(receipt, undefined)).toBeNull();
    expect(inputCutRunShare(null, "e1")).toBeNull();
  });
});
