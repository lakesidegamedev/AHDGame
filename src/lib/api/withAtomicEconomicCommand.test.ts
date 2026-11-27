import { withAtomicResult } from "@/lib/db/withAtomicResult";
import { describe, expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withAtomicEconomicCommand } from "./withAtomicEconomicCommand";
import { afterCommit } from "@/lib/db/sessionDb";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 10, worldEpochId: "test", isProcessing: false },
  ]);
  f.memory.seed("wallets", [
    { _id: "payer", cash: 100 },
    { _id: "payee", cash: 0 },
  ]);
  return f;
}
describe("atomic economic commands", () => {
  it("rolls back partial cash and rejects deferred side effects when a command returns a refusal", async () => {
    const f = fixture();
    let announced = false;
    const result = await withAtomicEconomicCommand(f.db, async (db) => {
      await db
        .collection<{ _id: string; cash: number }>("wallets")
        .updateOne({ _id: "payer" }, { $inc: { cash: -50 } });
      await afterCommit(db, async () => {
        announced = true;
      });
      return new Response("ownership changed", { status: 409 });
    });
    expect(result.status).toBe(409);
    expect(f.memory.collection("wallets").docs.map((row) => row.cash)).toEqual([100, 0]);
    expect(announced).toBe(false);
  });
  it("does not mutate an active or abandoned processing snapshot", async () => {
    const f = fixture();
    await f.memory
      .collection("gameState")
      .updateOne(
        { _id: "current" },
        { $set: { isProcessing: true, processingAbandonedAt: new Date(0) } }
      );
    let ran = false;
    expect(
      (
        await withAtomicEconomicCommand(f.db, async () => {
          ran = true;
          return new Response();
        })
      ).status
    ).toBe(409);
    expect(ran).toBe(false);
  });
  it("commits cash and the turn fence together and rolls back a thrown interruption", async () => {
    const f = fixture();
    await expect(
      withAtomicEconomicCommand(f.db, async (db) => {
        await db
          .collection<{ _id: string; cash: number }>("wallets")
          .updateOne({ _id: "payer" }, { $inc: { cash: -50 } });
        throw new Error("interrupted transfer");
      })
    ).rejects.toThrow("interrupted transfer");
    expect(f.memory.collection("wallets").docs[0].cash).toBe(100);
    expect((await withAtomicEconomicCommand(f.db, async () => new Response())).status).toBe(200);
  });
});

it("preserves a nested domain refusal status and rolls back the parent command", async () => {
  const f = fixture();
  const result = await withAtomicEconomicCommand(f.db, async (db) => {
    await withAtomicResult(db, async (tx) => {
      await tx.collection("wallets").updateOne({ _id: "payer" as never }, { $inc: { cash: -10 } });
      return { ok: false, status: 409, error: "Operation slot already used" };
    });
    return Response.json({ ok: true });
  });
  expect(result.status).toBe(409);
  expect(await result.json()).toMatchObject({ error: "Operation slot already used" });
  expect(f.memory.collection("wallets").docs[0].cash).toBe(100);
});
