import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { bookExtractionDepletion } from "./extractionDepletion";
import {
  depletedCapacityDoc,
  extractionOpeningDoc,
  DEPOSIT_RESERVE_TURNS,
} from "@/lib/extraction/depletion";
import type { StateResourceCapacity } from "@/lib/db/types/stateResourceCapacity";
import type { ExtractionSectorInput } from "@/lib/turn/extraction/extractionCapacity";

describe("depletion replay", () => {
  it("does not double-book a landed bulk write and retains the opening reserve for rationing", async () => {
    const memory = createInMemoryDb();
    const original = 100 * DEPOSIT_RESERVE_TURNS - 30;
    memory.seed("stateResourceCapacity", [
      {
        _id: new ObjectId(),
        stateId: "TX",
        countryId: "US",
        resources: { oil: 100 },
        extractedUnits: { oil: original },
      },
    ]);
    const fault = withInjectedCrash(memory, {
      collection: "stateResourceCapacity",
      op: "bulkWrite",
      onCall: 1,
      afterWrite: true,
    });
    const inputs = [
      { sectorId: "one", stateId: "TX", revenueBasedOutput: { oil: 20 } },
    ] as ExtractionSectorInput[];
    const run = (turn: number) =>
      bookExtractionDepletion(fault.db, inputs, new Map(), new Date(0), turn);
    await expect(run(5)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    await run(5);
    const stored = memory.collection("stateResourceCapacity")
      .docs[0] as unknown as StateResourceCapacity;
    expect(stored.extractedUnits?.oil).toBe(original + 20);
    expect(depletedCapacityDoc(extractionOpeningDoc(stored, 5)).resources.oil).toBe(30);
    expect(depletedCapacityDoc(stored).resources.oil).toBe(10);
    await run(6);
    expect(stored.extractedUnits?.oil).toBe(original + 40);
  });
});
