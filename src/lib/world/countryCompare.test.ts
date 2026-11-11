import { describe, expect, it } from "vitest";
import { MAP_COMPARE_SLOTS, comparePairReady, toggleComparePair } from "./countryCompare";

describe("toggleComparePair", () => {
  it("fills the first slot", () => {
    expect(toggleComparePair([], "FR")).toEqual(["FR"]);
  });

  it("keeps selection order when the second nation is added", () => {
    expect(toggleComparePair(["FR"], "JP")).toEqual(["FR", "JP"]);
  });

  it("removes a selected nation without disturbing the other", () => {
    expect(toggleComparePair(["FR", "JP"], "FR")).toEqual(["JP"]);
  });

  it("makes room for a third pick by dropping the oldest selection", () => {
    expect(toggleComparePair(["FR", "JP"], "BR")).toEqual(["JP", "BR"]);
  });

  it("replaces the oldest pick again on a full tray, so the newest pair stays", () => {
    expect(toggleComparePair(["JP", "BR"], "FR")).toEqual(["BR", "FR"]);
  });

  it("holds exactly two slots", () => {
    expect(MAP_COMPARE_SLOTS).toBe(2);
    expect(toggleComparePair(["FR", "JP"], "BR")).toHaveLength(MAP_COMPARE_SLOTS);
  });

  it("does not mutate the selection it was given", () => {
    const selected = ["FR"];
    toggleComparePair(selected, "JP");
    expect(selected).toEqual(["FR"]);
  });
});

describe("comparePairReady", () => {
  it("is true only when both slots are filled", () => {
    expect(comparePairReady([])).toBe(false);
    expect(comparePairReady(["FR"])).toBe(false);
    expect(comparePairReady(["FR", "JP"])).toBe(true);
  });
});
