import { it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { mergePartyInto } from "./mergeParty";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
it("retires over-cap political actors without deleting their money or financial ownership", async () => {
  const f = createTransactionalMemoryDb(),
    source = new ObjectId(),
    target = new ObjectId(),
    npp = new ObjectId(),
    corp = new ObjectId();
  f.memory.seed("politicalParties", [
    { _id: source, sequentialId: 1, countryId: "CA", treasury: 100 },
    { _id: target, sequentialId: 2, countryId: "CA", treasury: 200 },
  ]);
  f.memory.seed("states", [{ _id: "ON", countryId: "CA" }]);
  const estate = {
    funds: 40,
    currencyBalances: { personal: { CAD: 30 } },
    nppInvestmentCashAnchor: 20,
  };
  f.memory.seed("npps", [
    {
      _id: npp,
      party: "1",
      countryId: "CA",
      homeState: "ON",
      retiredAt: null,
      politicalInfluence: 10,
      favorability: 50,
      ...estate,
    },
  ]);
  f.memory.seed("corporations", [
    {
      _id: corp,
      ceoId: npp,
      ceoType: "npp",
      shareholders: [{ nppId: npp, shares: 100 }],
      liquidCapital: 500,
    },
  ]);
  const fault = withInjectedCrash(f.memory, {
    collection: "npps",
    op: "updateMany",
    onCall: 2,
    afterWrite: true,
  });
  await expect(
    mergePartyInto(fault.db, source, target, 5, { requireAdjacency: false })
  ).rejects.toThrow();
  expect(fault.crashed).toBe(true);
  expect(f.memory.collection("npps").docs[0]).toMatchObject({
    ...estate,
    party: "1",
    retiredAt: null,
  });
  expect(f.memory.collection("politicalParties").docs.map((row) => row.treasury)).toEqual([
    100, 200,
  ]);
  await Promise.all([
    mergePartyInto(f.db, source, target, 5, { requireAdjacency: false }),
    mergePartyInto(f.db, source, target, 5, { requireAdjacency: false }),
  ]);
  expect(f.memory.collection("npps").docs).toHaveLength(1);
  expect(f.memory.collection("npps").docs[0]).toMatchObject({
    ...estate,
    party: "2",
    currentOffice: null,
  });
  expect(f.memory.collection("npps").docs[0].retiredAt).toBeInstanceOf(Date);
  expect(f.memory.collection("corporations").docs[0]).toMatchObject({
    ceoId: npp,
    shareholders: [{ nppId: npp, shares: 100 }],
    liquidCapital: 500,
  });
  expect(f.memory.collection("politicalParties").docs.map((row) => row.treasury)).toEqual([0, 300]);
});
