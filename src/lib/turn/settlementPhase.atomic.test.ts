import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { SettlementCrisisDoc } from "@/lib/db/types/settlementCrisis";
import type { SettlementPlayDoc } from "@/lib/db/types/settlementPlay";
import {
  HUNDREDTHS,
  SETTLEMENT_INSTITUTIONS,
  SETTLEMENT_SEATS,
} from "@/lib/constants/settlementCrisis";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processSettlementTurn } from "./settlementPhase";
vi.mock("@/lib/settlement/emitWire", () => ({
  emitSettlementWire: vi.fn(async () => ({ posts: 0 })),
}));
const CRISIS_ID = new ObjectId();

function crisis(over: Partial<SettlementCrisisDoc> = {}): SettlementCrisisDoc {
  return {
    _id: CRISIS_ID,
    kind: "settlement.germanQuestion",
    status: "open",
    targetEntityId: "DE",
    challengerEntityId: "DD",
    position: 3820,
    institutions: SETTLEMENT_INSTITUTIONS.map((i) => ({
      id: i.id,
      weight: i.weight,
      position: i.opening,
      lastPlay: null,
      lastDrift: 0,
    })),
    seats: SETTLEMENT_SEATS.map((s) => ({
      id: s.id,
      capital: 10,
      actions: 1,
      lastActedTurn: 411,
      committedPoints: 0,
    })),
    ladder: { heat: 2, armedTurn: null },
    driftHistory: [],
    lastTickedTurn: 411,
    conflictId: null,
    openedTurn: 400,
    resolvedTurn: null,
    outcome: null,
    cooldownUntilTurn: null,
    createdAt: new Date("1953-01-01T00:00:00Z"),
    updatedAt: new Date("1953-01-01T00:00:00Z"),
    ...over,
  };
}

function play(over: Partial<SettlementPlayDoc> = {}): SettlementPlayDoc {
  return {
    _id: new ObjectId(),
    crisisId: CRISIS_ID,
    actor: "seat",
    seatId: "DD",
    characterId: new ObjectId(),
    countryId: "DD",
    playId: "aid",
    targetInstitutionId: "laender",
    direction: 1,
    class: "spend",
    costs: { funds: 0, capital: 0, actions: 1 },
    basePoints: 4 * HUNDREDTHS,
    appliedPoints: null,
    heatAdded: 0,
    turn: 412,
    resolvedTurn: null,
    createdAt: new Date("1953-01-01T00:00:00Z"),
    ...over,
  };
}

describe("settlement tick interruption", () => {
  it("keeps the play pending when its applied-points stamp fails, then applies once on retry", async () => {
    const { memory } = createTransactionalMemoryDb();
    memory.seed("settlementCrises", [{ ...crisis() }]);
    memory.seed("settlementPlays", [{ ...play() }]);
    const fault = withInjectedCrash(memory, {
      collection: "settlementPlays",
      op: "updateOne",
      onCall: 2,
      afterWrite: true,
    });
    await expect(processSettlementTurn(fault.db, 412)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("settlementCrises").docs[0].lastTickedTurn).toBe(411);
    expect(memory.collection("settlementPlays").docs[0]).toMatchObject({
      resolvedTurn: null,
      appliedPoints: null,
    });
    const applied = await processSettlementTurn(fault.db, 412);
    expect(applied.playsResolved).toBe(1);
    const settledPosition = memory.collection("settlementCrises").docs[0].position;
    expect(memory.collection("settlementPlays").docs[0].appliedPoints).toBeGreaterThan(0);
    expect((await processSettlementTurn(fault.db, 412)).playsResolved).toBe(0);
    expect(memory.collection("settlementCrises").docs[0].position).toBe(settledPosition);
  });
});
