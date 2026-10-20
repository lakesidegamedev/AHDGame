import { describe, expect, it } from "vitest";
import { newEntrantProducerBooks } from "./openingState";

describe("new producer entrants", () => {
  it("gives a founding corporation and sector empty books at the last settled turn", () => {
    expect(newEntrantProducerBooks({}, "corporation", "w", 9)).toEqual({
      producerPayables: { worldEpoch: "w", turn: 9, claims: [] },
    });
    expect(newEntrantProducerBooks({ inventoryUnits: { food: 0 } }, "sector", "w", 9)).toEqual({
      producerCapacity: { worldEpoch: "w", turn: 9 },
      producerInventory: { worldEpoch: "w", turn: 9, inputStock: [], outputStock: [] },
      capacityBookAnchor: 0,
      buildQueue: [],
    });
    expect(
      newEntrantProducerBooks({ capacityBookAnchor: 50, buildQueue: [] }, "sector", "w", 9)
    ).not.toHaveProperty("capacityBookAnchor");
  });

  it("leaves records with books or unconverted legacy value alone", () => {
    const stamp = { worldEpoch: "w", turn: 3 };
    expect(newEntrantProducerBooks({ producerPayables: stamp }, "corporation", "w", 9)).toBeNull();
    expect(
      newEntrantProducerBooks({ operatingCashArrearsByCurrency: { USD: 5 } }, "corporation", "w", 9)
    ).toBeNull();
    expect(
      newEntrantProducerBooks(
        { producerCapacity: stamp, producerInventory: stamp },
        "sector",
        "w",
        9
      )
    ).toBeNull();
    expect(newEntrantProducerBooks({ inventoryUnits: { food: 4 } }, "sector", "w", 9)).toBeNull();
  });
});
