import { describe, expect, it } from "vitest";
import { storeGoodsResoldDaily } from "./storeRevenueDisplay";

describe("store revenue display", () => {
  const store = {
    sectorType: "retail" as const,
    producerSettlement: { store: { goodsBoughtWholesale: 1000, markupEarned: 350 } },
  } as unknown as Parameters<typeof storeGoodsResoldDaily>[0];

  it("turns the anchor-per-turn goods value into a daily figure in the sector's currency", () => {
    // 1000 anchor a turn, 12 turns a day, 0.8 anchor per local unit.
    expect(storeGoodsResoldDaily(store, 12, 0.8)).toBeCloseTo(15_000, 9);
  });

  it("is zero for anything that is not a store with a store receipt", () => {
    expect(
      storeGoodsResoldDaily({ ...store, sectorType: "manufacturing" } as typeof store, 12, 1)
    ).toBe(0);
    expect(
      storeGoodsResoldDaily({ sectorType: "retail", producerSettlement: {} } as typeof store, 12, 1)
    ).toBe(0);
    expect(storeGoodsResoldDaily(store, 12, 0)).toBe(0);
  });
});
