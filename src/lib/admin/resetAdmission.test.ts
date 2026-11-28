import { expect, it } from "vitest";
import { NextResponse } from "next/server";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { withAtomicEconomicCommand } from "@/lib/api/withAtomicEconomicCommand";
import { withWorldResetAdmission } from "./resetAdmission";
function fixture() {
  const state = createTransactionalMemoryDb();
  state.memory.seed("gameState", [
    { _id: "current", currentTurn: 209, isActive: true, isProcessing: false },
  ]);
  return state;
}
it("rejects an in-flight turn before any teardown", async () => {
  const { db, memory } = fixture();
  memory.collection("gameState").docs[0].isProcessing = true;
  let reached = false;
  await expect(
    withWorldResetAdmission(db, async () => {
      reached = true;
    })
  ).rejects.toThrow("processing");
  expect(reached).toBe(false);
  expect(memory.collection("gameState").docs[0].isActive).toBe(true);
});
it("the direct teardown entry also refuses an active turn", async () => {
  const { db, memory } = fixture();
  memory.collection("gameState").docs[0].isProcessing = true;
  memory.seed("federalBudget", [{ _id: "CA", treasuryBalance: 12345 }]);
  const { resetGameWorld } = await import("./resetGameWorld");
  await expect(
    resetGameWorld(db, { preset: "2019-default", deleteProfiles: true, seedHistorical: false })
  ).rejects.toThrow("processing");
  expect(memory.collection("federalBudget").docs[0].treasuryBalance).toBe(12345);
  expect(memory.collection("gameState").docs[0].currentTurn).toBe(209);
});
it("blocks another reset and money commands while preserving a new paused world", async () => {
  const { db, memory } = fixture();
  await withWorldResetAdmission(db, async () => {
    expect(memory.collection("gameState").docs[0].resetAdmissionId).toEqual(expect.any(String));
    await expect(withWorldResetAdmission(db, async () => 0)).rejects.toThrow("processing");
    expect(
      (await withAtomicEconomicCommand(db, async () => NextResponse.json({ ok: true }))).status
    ).toBe(409);
    await db
      .collection("gameState")
      .updateOne({ _id: "current" } as never, { $set: { currentTurn: 1, resetWorldId: "new" } });
  });
  expect(memory.collection("gameState").docs[0]).toMatchObject({
    currentTurn: 1,
    resetWorldId: "new",
    resetAdmissionId: null,
    isActive: false,
    isProcessing: false,
  });
});
it("releases only its own reservation after a lost claim acknowledgement", async () => {
  const { memory } = fixture();
  const fault = withInjectedCrash(memory, {
    collection: "gameState",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  let reached = false;
  await expect(
    withWorldResetAdmission(fault.db, async () => {
      reached = true;
    })
  ).rejects.toThrow();
  expect(fault.crashed).toBe(true);
  expect(reached).toBe(false);
  expect(memory.collection("gameState").docs[0].resetAdmissionId).toBeNull();
  await expect(withWorldResetAdmission(fault.db, async () => "recovered")).resolves.toBe(
    "recovered"
  );
});
it("keeps failed bootstrap sealed while making an explicit retry possible", async () => {
  const { db, memory } = fixture();
  await expect(
    withWorldResetAdmission(db, async () => {
      throw new Error("bootstrap failed");
    })
  ).rejects.toThrow("bootstrap failed");
  expect(memory.collection("gameState").docs[0]).toMatchObject({
    isActive: false,
    resetAdmissionId: null,
  });
});
