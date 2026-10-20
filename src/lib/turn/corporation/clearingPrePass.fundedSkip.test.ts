import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/market/internalSupply/rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/market/internalSupply/rules")>();
  return {
    ...actual,
    allocateInternalSupply: vi.fn((args: Parameters<typeof actual.allocateInternalSupply>[0]) =>
      actual.allocateInternalSupply(args)
    ),
  };
});

import { allocateInternalSupply } from "@/lib/market/internalSupply/rules";
import { reserveInternalSupply } from "@/lib/market/internalSupply/clearing";
import { runInternalSupplyWorld } from "@/lib/test-utils/internalSupplyWorld";
import { FUNDED_TURN_INTERNAL_SUPPLY_COMMODITIES } from "./clearingPrePass";

const allocate = vi.mocked(allocateInternalSupply);
const OWN = { priority: "own", discount: 0.1 } as const;

beforeEach(() => {
  allocate.mockClear();
});

describe("clearing pre-pass on a funded producer turn", () => {
  it("leaves legacy turns unchanged: own-group supply still reserves and settles", () => {
    const implicit = runInternalSupplyWorld(OWN, { brandLoyaltyEnabled: true });
    const implicitCalls = allocate.mock.calls.length;
    allocate.mockClear();
    const explicit = runInternalSupplyWorld(OWN, {
      brandLoyaltyEnabled: true,
      fundedProducerTurn: false,
    });

    expect(implicitCalls).toBeGreaterThan(0);
    expect(allocate.mock.calls.length).toBe(implicitCalls);
    expect(implicit.market.internalSupplyTrades?.length).toBeGreaterThan(0);
    expect(implicit.updates[1]?.internalSupplyReceipt?.received.iron).toBeGreaterThan(0);
    expect(explicit.market.clearingBySectorId).toEqual(implicit.market.clearingBySectorId);
    expect(explicit.market.internalSupplyTrades).toEqual(implicit.market.internalSupplyTrades);
    expect(explicit.updates).toEqual(implicit.updates);
    expect(explicit.prePass).toEqual(implicit.prePass);
  });

  it("skips own-group allocation on non-advertising books and clears them on the open market", () => {
    const funded = runInternalSupplyWorld(OWN, {
      brandLoyaltyEnabled: true,
      fundedProducerTurn: true,
    });
    expect(allocate).not.toHaveBeenCalled();
    expect(funded.market.internalSupplyTrades ?? []).toHaveLength(0);
    expect(funded.updates[1]?.internalSupplyReceipt?.received).toEqual({});
    expect(funded.updates[1]?.internalSupplyReceipt?.discountCostAnchor ?? 0).toBe(0);

    // Same fills and pre-pass outputs as a world where nobody asked for
    // own-group sourcing: the open-market book is what the funded turn keeps.
    const openMarket = runInternalSupplyWorld(
      { priority: "market", discount: 0 },
      { brandLoyaltyEnabled: true }
    );
    expect(funded.market.clearingBySectorId).toEqual(openMarket.market.clearingBySectorId);
    expect(funded.prePass.brandLoyaltyUpdates.length).toBeGreaterThan(0);
    expect(funded.prePass).toEqual(openMarket.prePass);
  });

  it("still reserves own-group advertising, whose legacy settlement moves money", () => {
    expect([...FUNDED_TURN_INTERNAL_SUPPLY_COMMODITIES]).toEqual(["advertising"]);
    const context = {
      reserveCommodities: FUNDED_TURN_INTERNAL_SUPPLY_COMMODITIES,
      policies: new Map([["corp-a", { root: "corp-a", policy: OWN }]]),
      buyers: [
        {
          sectorId: "buyer",
          corporationId: "corp-a",
          demand: new Map([
            ["advertising", 10],
            ["iron", 10],
          ]),
        },
      ],
      availabilityOut: new Map(),
      discountCostOut: new Map(),
      tradesOut: [],
    };
    const args = {
      context,
      sellers: [{ id: "seller", units: 20, posture: 0 }] as never,
      corporationBySector: new Map([
        ["seller", "corp-a"],
        ["buyer", "corp-a"],
      ]),
      committed: undefined,
      book: "",
      bookForSector: () => "",
      supply: 20,
      demand: 30,
      reservationRoom: 30,
      marketPrice: 1,
    };

    expect(reserveInternalSupply({ ...args, commodity: "iron" })).toBeUndefined();
    expect(allocate).not.toHaveBeenCalled();
    const advertising = reserveInternalSupply({ ...args, commodity: "advertising" });
    expect(allocate).toHaveBeenCalledTimes(1);
    expect(advertising?.get("seller")).toBe(10);

    // Without the filter (legacy turns) every book reserves.
    allocate.mockClear();
    const legacy = reserveInternalSupply({
      ...args,
      context: { ...context, reserveCommodities: undefined },
      commodity: "iron",
    });
    expect(allocate).toHaveBeenCalledTimes(1);
    expect(legacy?.get("seller")).toBe(10);
  });
});
