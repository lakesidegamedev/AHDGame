import { expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { loadRegionalDebtApprovalModifiers } from "./regionalDebtApproval";
it("keeps debt approval local, favors the authoritative ledger and does not mutate approval", async () => {
  const db = createMockDb();
  db.collection("stateBudgets").find.mockReturnValue({
    toArray: async () => [
      { _id: "TX", financing: { principal: 50_000_000 } },
      { _id: "ON", financing: { principal: 900_000_000 } },
    ],
  });
  db.collection("regionalBudgets").find.mockReturnValue({
    toArray: async () => [{ _id: "ON", financing: { principal: 10_000_000 } }],
  });
  const mods = await loadRegionalDebtApprovalModifiers(db as unknown as Db, "CA", [
    { _id: "TX", gdp: 100 },
    { _id: "ON", gdp: 100 },
    { _id: "QC", gdp: 100 },
  ]);
  expect(mods.get("TX")?.[0]).toMatchObject({ effect: -5, source: "fiscal", marginEffect: 0 });
  expect(mods.get("ON")?.[0].effect).toBe(-1);
  expect(mods.get("QC")).toEqual([]);
  expect(db.collectionMocks.stateBudgets.find).toHaveBeenCalledWith(
    { countryId: "CA" },
    expect.anything()
  );
  expect(db.collectionMocks.stateBudgets.updateOne).not.toHaveBeenCalled();
});
