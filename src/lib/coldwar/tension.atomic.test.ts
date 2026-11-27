import type { Document } from "mongodb";
import { describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyTensionEvent, getColdWarTension, runTensionTurn, stepTension } from "./tension";
const pressures = {
  escalationLevel: 0,
  activeCrises: 0,
  totalWarheads: 0,
  nuclearWarIntensity: 0,
  nuclearWarCount: 0,
  otherWarIntensity: 0,
};
describe("tension event and turn serialization", () => {
  it("preserves the keyed event and its receipt when a refresh overlaps", async () => {
    const { db } = createTransactionalMemoryDb();
    await db.collection<Document & { _id: string }>("coldWarTension").insertOne({
      _id: "current",
      value: 40,
      pressureFloor: 12,
      updatedTurn: 9,
      events: [],
      updatedAt: new Date(0),
    });
    await Promise.all([
      applyTensionEvent(db, 10, "escalation", "Synthetic shock", 8, { eventId: "shock" }),
      runTensionTurn(db, 10, pressures),
    ]);
    const state = await getColdWarTension(db);
    expect(state.value).toBe(stepTension(48, pressures));
    expect(state.appliedEventIds).toEqual(["shock"]);
    expect(state.events).toHaveLength(1);
    await applyTensionEvent(db, 10, "escalation", "Synthetic shock", 8, { eventId: "shock" });
    await runTensionTurn(db, 10, pressures);
    expect(await getColdWarTension(db)).toEqual(state);
  });
  it("rolls back a landed refresh failure and keeps the event recoverable", async () => {
    const { db, memory } = createTransactionalMemoryDb();
    await applyTensionEvent(db, 9, "escalation", "Synthetic shock", 8, { eventId: "shock" });
    const before = await getColdWarTension(db);
    const fault = withInjectedCrash(memory, {
      collection: "coldWarTension",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(runTensionTurn(fault.db, 10, pressures)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(await getColdWarTension(db)).toEqual(before);
    const after = await runTensionTurn(db, 10, pressures);
    expect(after.appliedEventIds).toEqual(["shock"]);
    expect(after.value).toBe(stepTension(before.value, pressures));
  });
});
