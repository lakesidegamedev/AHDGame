import { expect, it } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { topUpDefenceTenderReservation } from "./reservations";
import type { GovernmentTender } from "./types";
function fixture() {
  const f = createTransactionalMemoryDb();
  const tender = {
    _id: "synthetic",
    countryId: "US",
    allocationWindowId: "US:0",
    reservedAmount: 100,
  } as GovernmentTender;
  f.memory.seed("defenceProcurementAllocations", [
    {
      _id: "US:0",
      countryAmount: 100,
      governmentTenderReservations: { synthetic: { state: "held", amount: 100, leaseRevision: 4 } },
    },
  ]);
  f.memory.seed("federalBudget", [
    {
      countryId: "US",
      defenseAppropriation: {
        balance: 1000,
        encumbered: 100,
        governmentTenderReservations: { synthetic: { state: "held", amount: 100 } },
      },
    },
  ]);
  return { ...f, tender };
}
it("tops up the observed reservation once under overlapping stale refreshes and keeps lease fencing", async () => {
  const f = fixture();
  expect(
    await Promise.all(
      [1, 2, 3].map(() => topUpDefenceTenderReservation(f.db, f.tender, 150, 1000000))
    )
  ).toEqual([true, true, true]);
  expect(f.memory.collection("defenceProcurementAllocations").docs[0]).toMatchObject({
    countryAmount: 150,
    governmentTenderReservations: { synthetic: { amount: 150, leaseRevision: 4 } },
  });
  expect(
    (
      f.memory.collection("federalBudget").docs[0].defenseAppropriation as {
        balance: number;
        encumbered: number;
      }
    ).encumbered
  ).toBe(150);
});
it("rolls back both reservation legs after a lost appropriation acknowledgement and retries cleanly", async () => {
  const f = fixture();
  const fault = withInjectedCrash(f.memory, {
    collection: "federalBudget",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: f.db.client });
  await expect(topUpDefenceTenderReservation(fault.db, f.tender, 150, 1000000)).rejects.toThrow();
  expect(f.memory.collection("defenceProcurementAllocations").docs[0].countryAmount).toBe(100);
  expect(
    (
      f.memory.collection("federalBudget").docs[0].defenseAppropriation as {
        balance: number;
        encumbered: number;
      }
    ).encumbered
  ).toBe(100);
  fault.disarm();
  expect(await topUpDefenceTenderReservation(f.db, f.tender, 150, 1000000)).toBe(true);
});
it("does not consume quota when the matching appropriation cannot be reserved", async () => {
  const f = fixture();
  (
    f.memory.collection("federalBudget").docs[0].defenseAppropriation as {
      balance: number;
      encumbered: number;
    }
  ).balance = 100;
  expect(await topUpDefenceTenderReservation(f.db, f.tender, 150, 1000000)).toBe(false);
  expect(f.memory.collection("defenceProcurementAllocations").docs[0].countryAmount).toBe(100);
});
