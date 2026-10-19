import { describe, expect, it } from "vitest";
import { isolatedShadowEnv, legacyPnlBySectorId } from "./producerMarketShadowPhase";
import type { ProducerPhysicalEnv } from "./producerPhysicalPreparation";

describe("producer-market shadow isolation", () => {
  it("never writes into the live turn's collectors", () => {
    const live = {
      currentTurn: 10,
      labourDemandByState: new Map([["NY", { desired: 5 }]]),
      labourDemandWageIndexByState: new Map([["NY", 1.1]]),
      wageIndexByState: new Map([["NY", { weighted: 2, workers: 3 }]]),
      automationIndexByState: new Map([["NY", { weighted: 1, workers: 1 }]]),
      pendingStrikeEvents: [{ id: "s1" }],
    } as unknown as ProducerPhysicalEnv;
    const shadow = isolatedShadowEnv(live);
    (shadow.labourDemandByState as Map<string, unknown>).set("CA", { desired: 9 });
    (shadow.wageIndexByState as Map<string, { weighted: number }>).get("NY")!.weighted = 99;
    (shadow.pendingStrikeEvents as unknown[]).push({ id: "s2" });
    expect((live.labourDemandByState as Map<string, unknown>).has("CA")).toBe(false);
    expect((live.wageIndexByState as Map<string, { weighted: number }>).get("NY")!.weighted).toBe(
      2
    );
    expect(live.pendingStrikeEvents).toHaveLength(1);
    expect(shadow.pendingStrikeEvents).toHaveLength(1);
  });

  it("reads the legacy plant P&L from this turn's sector writes", () => {
    const m = legacyPnlBySectorId([
      {
        updateOne: {
          filter: { _id: { toString: () => "a" } },
          update: { $set: { plantsPnl: { revenue: 10, profit: 2 } } },
        },
      },
      { updateOne: { filter: { _id: { toString: () => "b" } }, update: { $set: {} } } },
    ]);
    expect(m.get("a")).toEqual({ revenue: 10, profit: 2 });
    expect(m.has("b")).toBe(false);
  });

  it("gives an unconverted sector an in-memory opening with its stock, without touching it", async () => {
    const { shadowOpeningSector } = await import("./producerMarketShadowPhase");
    const sector = {
      stateId: "MN",
      capitalStock: 10,
      inventoryUnits: { iron: 5, healthcare_services: 2, coal: 0 },
    } as never;
    const copy = shadowOpeningSector(sector, "w", 300);
    expect(copy.producerCapacity).toMatchObject({ worldEpoch: "w", turn: 299 });
    expect(copy.producerInventory!.outputStock).toEqual([
      { commodity: "iron", units: 5, book: "world" },
      { commodity: "healthcare_services", units: 2, book: "state:MN" },
    ]);
    expect((sector as { producerCapacity?: unknown }).producerCapacity).toBeUndefined();
  });
});
