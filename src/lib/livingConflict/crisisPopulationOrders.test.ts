import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";

vi.mock("./refugeeReception", () => ({
  loadRefugeeAdmissionAuthorization: vi.fn(async () => ({
    basis: "humanitarian-response",
    admissionMultiplier: 1,
    laws: [],
  })),
}));

import {
  completeCrisisPopulationOrders,
  loadPendingCrisisPopulationOrders,
} from "./crisisPopulationOutbox";
import { raiseCrisisPopulationOrders } from "./crisisPopulationOrders";

type Doc = Record<string, unknown>;

function makeDb() {
  const pushed: { filter: Doc; update: Doc }[] = [];
  const existing = new Set<string>();
  const collections: Record<string, Doc> = {
    gameState: {
      findOne: vi.fn(async () => ({ worldEpochId: "w1", currentTurn: 10, isProcessing: false })),
    },
    states: {
      find: vi.fn(() => ({
        toArray: async () => [
          { _id: "US_OH", countryId: "US", population: 1_000_000 },
          { _id: "US_MI", countryId: "US", population: 1_000_000 },
          { _id: "DE_BY", countryId: "DE", population: 500_000 },
        ],
      })),
    },
    federalBudget: {
      find: vi.fn(() => ({ toArray: async () => [{ countryId: "DE", gdp: 5_000_000_000 }] })),
    },
    crises: {
      updateOne: vi.fn(async (filter: Doc, update: Doc) => {
        const push = update.$push as Doc | undefined;
        const order = push ? (Object.values(push)[0] as { _id: string }) : null;
        if (order) {
          if (existing.has(order._id)) return { modifiedCount: 0 };
          existing.add(order._id);
          pushed.push({ filter, update });
        }
        return { modifiedCount: 1 };
      }),
      updateMany: vi.fn(async () => ({})),
      find: vi.fn(),
    },
  };
  return {
    db: { collection: (name: string) => collections[name] } as never,
    collections,
    pushed,
  };
}

describe("raiseCrisisPopulationOrders", () => {
  it("raises one deterministic loss order per country and ignores a replay", async () => {
    const { db, pushed } = makeDb();
    const crisisId = new ObjectId();
    const request = { losses: [{ countryId: "US", fraction: 0.0005 }], receptions: [] };
    const first = await raiseCrisisPopulationOrders(db, crisisId, 10, request);
    const second = await raiseCrisisPopulationOrders(db, crisisId, 10, request);
    expect(first.civilianLoss).toBe(1);
    expect(second.civilianLoss).toBe(0);
    const order = (pushed[0].update.$push as Record<string, Doc>)["populationOrders.civilianLoss"];
    expect(order.requestedPeople).toBeCloseTo(1000);
    expect(order.effectiveTurn).toBe(11);
    expect(order.origin).toBe("crisis");
    expect(order.regionIds).toEqual(["US_MI", "US_OH"]);
  });

  it("caps a single loss at the safe share of residents", async () => {
    const { db, pushed } = makeDb();
    await raiseCrisisPopulationOrders(db, new ObjectId(), 10, {
      losses: [{ countryId: "US", fraction: 0.9 }],
      receptions: [],
    });
    const order = (pushed[0].update.$push as Record<string, Doc>)["populationOrders.civilianLoss"];
    expect(order.requestedPeople).toBeCloseTo(20_000);
  });

  it("raises reception for a host with a fiscal base and skips the origin itself", async () => {
    const { db, pushed } = makeDb();
    const result = await raiseCrisisPopulationOrders(db, new ObjectId(), 10, {
      losses: [],
      receptions: [
        { originCountryId: "YU", destinationCountryId: "DE", fraction: 0.003 },
        { originCountryId: "DE", destinationCountryId: "DE", fraction: 0.003 },
        { originCountryId: "YU", destinationCountryId: "US", fraction: 0.003 },
      ],
    });
    expect(result.reception).toBe(1);
    const order = (pushed[0].update.$push as Record<string, Doc>)["populationOrders.reception"];
    expect(order.destinationCountryId).toBe("DE");
    expect(order.requestedPeople).toBeCloseTo(1500);
    expect((order.authorization as Doc).displacementActive).toBe(true);
  });
});

describe("crisis population outbox", () => {
  it("reads only pending orders whose turn has come", async () => {
    const rows = [
      {
        populationOrders: {
          civilianLoss: [
            { _id: "a", status: "pending", effectiveTurn: 5 },
            { _id: "b", status: "pending", effectiveTurn: 20 },
            { _id: "c", status: "complete", effectiveTurn: 1 },
          ],
          reception: [{ _id: "r", status: "pending", effectiveTurn: 5 }],
        },
      },
    ];
    const db = {
      collection: () => ({ find: () => ({ limit: () => ({ toArray: async () => rows }) }) }),
    } as never;
    const orders = await loadPendingCrisisPopulationOrders(db, "w1", 10);
    expect(orders.civilianLoss.map((o) => o._id)).toEqual(["a"]);
    expect(orders.reception.map((o) => o._id)).toEqual(["r"]);
  });

  it("completes orders on the crisis and clears the pending flag", async () => {
    const updateOne = vi.fn(async () => ({}));
    const updateMany = vi.fn(async () => ({}));
    const db = { collection: () => ({ updateOne, updateMany }) } as never;
    const crisisId = new ObjectId().toHexString();
    await completeCrisisPopulationOrders(db, {
      civilianLoss: [{ _id: "a", crisisId }],
      reception: [{ _id: "r", crisisId }],
    });
    expect(updateOne).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
