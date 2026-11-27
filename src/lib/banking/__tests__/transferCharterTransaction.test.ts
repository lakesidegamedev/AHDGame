import { expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { transferBankCharterToAcquirer } from "../transferCharter";
function fixture() {
  const f = createTransactionalMemoryDb();
  const source = new ObjectId(),
    destination = new ObjectId();
  f.memory.seed("corporations", [
    {
      _id: source,
      name: "Synthetic bank",
      bankCharter: {
        type: "retail",
        status: "active",
        currency: "USD",
        charteredTurn: 1,
        postedCapital: 100,
        cashReserves: 100,
        totalLoans: 0,
        totalDeposits: 0,
        npcDeposits: 0,
        depositOffset: 0,
        lendingOffset: 0,
      },
    },
    { _id: destination, name: "Synthetic acquirer" },
  ]);
  f.memory.seed("bankLoans", [{ bankCorporationId: source, outstanding: 10 }]);
  return { ...f, source, destination };
}
it("rolls back copied bank, original release and loan rekey on a lost rekey acknowledgement", async () => {
  const f = fixture();
  const fault = withInjectedCrash(f.memory, {
    collection: "bankLoans",
    op: "updateMany",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: f.db.client });
  await expect(
    transferBankCharterToAcquirer(fault.db, f.source, f.destination, new Date())
  ).rejects.toThrow();
  expect(f.memory.collection("corporations").docs[0].bankCharter).toMatchObject({
    cashReserves: 100,
  });
  expect(f.memory.collection("corporations").docs[1].bankCharter).toBeUndefined();
  expect(f.memory.collection("bankLoans").docs[0].bankCorporationId).toEqual(f.source);
  fault.disarm();
  await Promise.all([
    transferBankCharterToAcquirer(f.db, f.source, f.destination, new Date()),
    transferBankCharterToAcquirer(f.db, f.source, f.destination, new Date()),
  ]);
  expect(f.memory.collection("corporations").docs[0].bankCharter).toBeUndefined();
  expect(f.memory.collection("corporations").docs[1].bankCharter).toMatchObject({
    cashReserves: 100,
  });
  expect(f.memory.collection("bankLoans").docs[0].bankCorporationId).toEqual(f.destination);
});
