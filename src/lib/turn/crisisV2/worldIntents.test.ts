import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const applyCapacityDestructionSpec = vi.hoisted(() => vi.fn(async () => undefined));
const raiseCrisisPopulationOrders = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/lib/livingConflict/capacityDestruction", () => ({ applyCapacityDestructionSpec }));
vi.mock("@/lib/livingConflict/crisisPopulationOrders", () => ({ raiseCrisisPopulationOrders }));

import { routeWorldIntents, type WorldIntentBatch } from "./worldIntents";

const crisisId = new ObjectId();
const empty = (): WorldIntentBatch => ({
  populationLoss: [],
  capitalStock: [],
  tradeRestriction: [],
  reception: [],
});

function makeDb() {
  const bulkWrite = vi.fn(async () => ({}));
  const db = { collection: vi.fn(() => ({ bulkWrite })) };
  return { db: db as never, bulkWrite };
}

describe("routeWorldIntents", () => {
  beforeEach(() => {
    applyCapacityDestructionSpec.mockClear();
    raiseCrisisPopulationOrders.mockClear();
  });

  it("turns capital intents into one destruction spec keyed on the crisis and turn", async () => {
    const batch = empty();
    batch.capitalStock.push(
      { kind: "capitalStock", fraction: 0.02, regionId: "US_OH" },
      { kind: "capitalStock", fraction: 0.5, regionId: "US_MI", repairTurns: 48 }
    );
    await routeWorldIntents(makeDb().db, batch, {
      stateIds: [],
      countryIds: ["US"],
      crisisId,
      turn: 9,
    });
    const request = (applyCapacityDestructionSpec.mock.calls[0] as unknown[])[1] as {
      spec: { regions: { regionId: string; capitalShare: number }[]; repairTurns: number };
      resolutionId: string;
    };
    expect(request.resolutionId).toBe(`${crisisId.toHexString()}:9`);
    expect(request.spec.regions).toEqual([
      { regionId: "US_OH", capitalShare: 0.02 },
      { regionId: "US_MI", capitalShare: 0.1 },
    ]);
    expect(request.spec.repairTurns).toBe(96);
  });

  it("spreads a regionless capital intent across the crisis's states", async () => {
    const batch = empty();
    batch.capitalStock.push({ kind: "capitalStock", fraction: 0.01 });
    await routeWorldIntents(makeDb().db, batch, {
      stateIds: ["US_OH", "US_MI"],
      countryIds: ["US"],
      crisisId,
      turn: 3,
    });
    const request = (applyCapacityDestructionSpec.mock.calls[0] as unknown[])[1] as {
      spec: { regions: unknown[] };
    };
    expect(request.spec.regions).toHaveLength(2);
  });

  it("raises population loss for the named country, else each crisis country", async () => {
    const batch = empty();
    batch.populationLoss.push(
      { kind: "populationLoss", fraction: 0.0001, countryId: "UK" },
      { kind: "populationLoss", fraction: 0.0002 }
    );
    await routeWorldIntents(makeDb().db, batch, {
      stateIds: [],
      countryIds: ["US", "DE"],
      crisisId,
      turn: 4,
    });
    const [, , turn, request] = raiseCrisisPopulationOrders.mock.calls[0] as unknown as [
      unknown,
      unknown,
      number,
      { losses: { countryId: string }[]; receptions: unknown[] },
    ];
    expect(turn).toBe(4);
    expect(request.losses.map((loss) => loss.countryId)).toEqual(["UK", "US", "DE"]);
  });

  it("sends migration from a named country to every other crisis country as reception", async () => {
    const batch = empty();
    batch.reception.push({
      kind: "migration",
      fraction: 0.003,
      fromCountryId: "YU",
      serviceTurns: 12,
    });
    await routeWorldIntents(makeDb().db, batch, {
      stateIds: [],
      countryIds: ["YU", "DE", "UK"],
      crisisId,
      turn: 6,
    });
    const request = (raiseCrisisPopulationOrders.mock.calls[0] as unknown[])[3] as {
      receptions: { originCountryId: string; destinationCountryId: string; serviceTurns: number }[];
    };
    expect(request.receptions.map((r) => r.destinationCountryId)).toEqual(["DE", "UK"]);
    expect(request.receptions.every((r) => r.originCountryId === "YU")).toBe(true);
    expect(request.receptions[0].serviceTurns).toBe(12);
  });

  it("writes embargoes with stable ids from non-target crisis countries to the target role", async () => {
    const { db, bulkWrite } = makeDb();
    const batch = empty();
    batch.tradeRestriction.push({
      kind: "tradeRestriction",
      commodity: "oil",
      targetRole: "belligerent",
      durationTurns: 20,
    });
    const targets = {
      stateIds: [],
      countryIds: ["US", "DE", "CN"],
      crisisId,
      turn: 7,
      rolesByCountry: { CN: "belligerent", US: "backer_a" },
    };
    await routeWorldIntents(db, batch, targets);
    await routeWorldIntents(db, batch, targets);
    type Op = {
      updateOne: { filter: { _id: ObjectId }; update: { $setOnInsert: Record<string, unknown> } };
    };
    const first = (bulkWrite.mock.calls[0] as unknown[])[0] as Op[];
    const second = (bulkWrite.mock.calls[1] as unknown[])[0] as Op[];
    expect(first.map((op) => op.updateOne.update.$setOnInsert.sourceCountry)).toEqual(["US", "DE"]);
    expect(first.every((op) => op.updateOne.update.$setOnInsert.targetCountry === "CN")).toBe(true);
    expect(first[0].updateOne.update.$setOnInsert.expiresTurn).toBe(27);
    expect(first.map((op) => op.updateOne.filter._id.toHexString())).toEqual(
      second.map((op) => op.updateOne.filter._id.toHexString())
    );
  });

  it("writes nothing for a restriction whose target role is unknown", async () => {
    const { db, bulkWrite } = makeDb();
    const batch = empty();
    batch.tradeRestriction.push({
      kind: "tradeRestriction",
      commodity: "oil",
      targetRole: "belligerent",
      durationTurns: 20,
    });
    await routeWorldIntents(db, batch, { stateIds: [], countryIds: ["US"], crisisId, turn: 7 });
    expect(bulkWrite).not.toHaveBeenCalled();
  });
});
