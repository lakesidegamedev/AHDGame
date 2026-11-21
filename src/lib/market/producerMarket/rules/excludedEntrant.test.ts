import { describe, expect, it } from "vitest";
import { excludedEntrantOpening } from "./excludedEntrant";
const empty = () => ({
  capitalStock: 0,
  capacityBookAnchor: 0,
  buildQueue: [],
  producerCapacity: { worldEpoch: "w", turn: 7 },
  producerInventory: { worldEpoch: "w", turn: 7, inputStock: [], outputStock: [] },
});
describe("excluded entrant opening", () => {
  it("retains the actual opening instead of rebasing capacity or construction", () => {
    const sector = empty();
    expect(excludedEntrantOpening(sector, "w", 11, 8, false)).toBe(7);
    expect(sector.producerCapacity.turn).toBe(7);
  });
  it("refuses included, wrong-world, mismatched and too-old sectors", () => {
    expect(excludedEntrantOpening(empty(), "w", 11, 8, true)).toBeNull();
    expect(excludedEntrantOpening(empty(), "other", 11, 8, false)).toBeNull();
    expect(
      excludedEntrantOpening(
        { ...empty(), producerInventory: { ...empty().producerInventory, turn: 8 } },
        "w",
        11,
        8,
        false
      )
    ).toBeNull();
    expect(excludedEntrantOpening(empty(), "w", 20, 8, false)).toBeNull();
  });
  it.each([
    { capitalStock: 1 },
    { capacityBookAnchor: 1 },
    { producerSettlement: { worldEpoch: "w", turn: 7 } },
    {
      producerInventory: {
        ...empty().producerInventory,
        outputStock: [{ commodity: "steel", book: "world", units: 1 }],
      },
    },
    {
      producerInventory: {
        ...empty().producerInventory,
        inputStock: [{ commodity: "steel", book: "world", units: 1 }],
      },
    },
  ])("never treats existing stock, value or a prior settlement as an empty opening", (change) => {
    expect(
      excludedEntrantOpening(
        { ...empty(), ...change } as Parameters<typeof excludedEntrantOpening>[0],
        "w",
        11,
        8,
        false
      )
    ).toBeNull();
  });
});
