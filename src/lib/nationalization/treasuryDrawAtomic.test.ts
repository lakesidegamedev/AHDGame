import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { drawFromTreasury } from "./treasury";

function world(funded = true) {
  const { db, memory } = createTransactionalMemoryDb();
  const corp = new ObjectId(),
    actor = new ObjectId();
  memory.seed("gameState", [{ _id: "current", currentTurn: 10, isProcessing: false }]);
  memory.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: funded }]);
  memory.seed("exchangeRates", [
    { currencyCode: "CAD", rate: 2 },
    { currencyCode: "USD", rate: 1 },
  ]);
  memory.seed("federalBudget", [
    {
      _id: new ObjectId(),
      countryId: "CA",
      currencyCode: "CAD",
      treasuryBalance: 1000,
      treasuryCashLocal: 1000,
    },
  ]);
  memory.seed("corporations", [
    {
      _id: corp,
      name: "Synthetic SOE",
      countryId: "CA",
      countryOwnerId: "CA",
      liquidCurrencyCode: "USD",
      liquidCapital: 100,
      ceoId: actor,
      ceoVacant: false,
      treasuryDrawCap: 700,
      treasuryDrawTurn: 10,
      treasuryDrawnThisTurn: 300,
    },
  ]);
  const input = {
    countryId: "CA" as const,
    corpId: corp,
    amountLocal: 300,
    corpCurrency: "USD" as const,
    actorId: actor,
  };
  return { db, memory, input };
}
it("moves equal anchor value from spendable Treasury cash and enforces the cap under concurrent requests", async () => {
  const { db, memory, input } = world();
  const results = await Promise.all([
    drawFromTreasury(db, input, new Date()),
    drawFromTreasury(db, input, new Date()),
  ]);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(memory.collection("federalBudget").docs[0]).toMatchObject({
    treasuryBalance: 700,
    treasuryCashLocal: 700,
  });
  expect(memory.collection("corporations").docs[0]).toMatchObject({
    liquidCapital: 250,
    treasuryDrawnThisTurn: 600,
  });
  expect(
    memory
      .collection("financialTxLog")
      .docs.map((row) => row.anchorAmount)
      .sort()
  ).toEqual([-150, 150]);
});
it("rolls back both cash legs, allowance and receipts after an acknowledged recipient write is interrupted", async () => {
  const { db, memory, input } = world();
  const fault = withInjectedCrash(memory, {
    collection: "corporations",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  await expect(drawFromTreasury(fault.db, input, new Date())).rejects.toThrow();
  expect(memory.collection("federalBudget").docs[0]).toMatchObject({
    treasuryBalance: 1000,
    treasuryCashLocal: 1000,
  });
  expect(memory.collection("corporations").docs[0]).toMatchObject({
    liquidCapital: 100,
    treasuryDrawnThisTurn: 300,
  });
  fault.disarm();
  expect((await drawFromTreasury(db, input, new Date())).ok).toBe(true);
});
it("keeps an unfunded signed position able to borrow while converting the destination correctly", async () => {
  const { db, memory, input } = world(false);
  memory.collection("federalBudget").docs[0].treasuryBalance = -100;
  expect((await drawFromTreasury(db, input, new Date())).ok).toBe(true);
  expect(memory.collection("federalBudget").docs[0]).toMatchObject({
    treasuryBalance: -400,
    treasuryCashLocal: 1000,
  });
  expect(memory.collection("corporations").docs[0].liquidCapital).toBe(250);
});
it("refuses insufficient funded cash, a changed CEO and a processing turn without consuming allowance", async () => {
  const { db, memory, input } = world();
  memory.collection("federalBudget").docs[0].treasuryCashLocal = 10;
  expect((await drawFromTreasury(db, input, new Date())).ok).toBe(false);
  expect((await drawFromTreasury(db, { ...input, actorId: new ObjectId() }, new Date())).ok).toBe(
    false
  );
  memory.collection("gameState").docs[0].isProcessing = true;
  expect((await drawFromTreasury(db, input, new Date())).ok).toBe(false);
  expect(memory.collection("corporations").docs[0]).toMatchObject({
    liquidCapital: 100,
    treasuryDrawnThisTurn: 300,
  });
  expect(memory.collection("financialTxLog").docs).toHaveLength(0);
});
