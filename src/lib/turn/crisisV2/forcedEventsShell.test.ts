import { describe, expect, it, vi } from "vitest";
import type { ForcedEventThreshold } from "@/lib/crises/v2/types";

const logWireEvent = vi.hoisted(() => vi.fn(async () => undefined));
const applyBankStress = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent }));
vi.mock("./intents", () => ({ applyBankStress, MAX_PANIC_TURNS: 4 }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runForcedEvents } from "./forcedEventsShell";

const event = (kind: ForcedEventThreshold["event"]): ForcedEventThreshold => ({
  id: kind,
  event: kind,
  minSeverity: 1,
  sustainedTurns: 1,
});

function makeDb() {
  const writes: { name: string; filter: unknown; update: unknown }[] = [];
  const db = {
    collection: (name: string) => ({
      updateMany: async (filter: unknown, update: unknown) =>
        void writes.push({ name, filter, update }),
    }),
  };
  return { db: db as never, writes };
}

const scope = {
  crisisId: "abc",
  label: "Recession",
  stateIds: ["TX"],
  countryIds: ["US"],
  turn: 30,
  def: { affectedSectors: ["energy"] },
};

describe("runForcedEvents", () => {
  it("starts strikes in affected sectors that are not already striking or cooling off", async () => {
    const { db, writes } = makeDb();
    await runForcedEvents(db, [event("strike")], scope);
    const write = writes.find((w) => w.name === "corporateSectors")!;
    expect(write.update).toEqual({ $set: { strikeStartedAtTurn: 30 } });
    expect(JSON.stringify(write.filter)).toContain("strikeCooldownUntilTurn");
    expect(write.filter).toMatchObject({
      stateId: { $in: ["TX"] },
      sectorType: { $in: ["energy"] },
    });
    expect(logWireEvent).toHaveBeenCalled();
  });

  it("moves each country to the edge of the sovereign default process", async () => {
    const { db, writes } = makeDb();
    await runForcedEvents(db, [event("sovereignDefaultPath")], scope);
    const write = writes.find((w) => w.name === "federalBudget")!;
    expect(write.update).toMatchObject({
      $set: { sovereignCrisisState: "warning" },
      $max: { failedAuctionConsecutiveCount: 2 },
    });
  });

  it("starts a bank panic through the existing path", async () => {
    const { db } = makeDb();
    await runForcedEvents(db, [event("bankRun")], scope);
    expect(applyBankStress).toHaveBeenCalledWith(db, 4, ["US"]);
  });

  it("announces an impeachment motion without filing anything", async () => {
    logWireEvent.mockClear();
    const { db, writes } = makeDb();
    const done = await runForcedEvents(db, [event("impeachmentMotion")], scope);
    expect(done).toBe(1);
    expect(writes).toHaveLength(0);
    expect(logWireEvent).toHaveBeenCalledTimes(1);
  });

  it("leaves a state of emergency to the instance itself", async () => {
    logWireEvent.mockClear();
    const { db, writes } = makeDb();
    expect(await runForcedEvents(db, [event("stateOfEmergency")], scope)).toBe(0);
    expect(writes).toHaveLength(0);
    expect(logWireEvent).not.toHaveBeenCalled();
  });
});
