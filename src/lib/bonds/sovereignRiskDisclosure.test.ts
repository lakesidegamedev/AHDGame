import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { loadSovereignRiskDisclosures } from "./sovereignRiskDisclosure";

describe("sovereign risk disclosure", () => {
  it("batch-loads distinct issuer budgets with a projection, including US legacy ID", async () => {
    const db = createMockDb();
    const budgets = db.collection("federalBudget");
    budgets.find().toArray.mockResolvedValue([
      { _id: "federal", creditRating: "AA" },
      { _id: "JP", creditRating: "CCC", sovereignCrisisState: "recovering", lastDefaultTurn: 40 },
    ]);
    budgets.find.mockClear();
    const result = await loadSovereignRiskDisclosures(db as unknown as Db, ["US", "JP", "US"]);
    expect(budgets.find).toHaveBeenCalledTimes(1);
    expect(budgets.find).toHaveBeenCalledWith(
      { _id: { $in: ["federal", "JP"] } },
      {
        projection: { creditRating: 1, sovereignCrisisState: 1, lastDefaultTurn: 1 },
      }
    );
    expect(result.get("JP")).toEqual({
      creditRating: "CCC",
      crisisState: "recovering",
      lastDefaultTurn: 40,
    });
    expect(result.get("US")?.creditRating).toBe("AA");
  });
  it("does no read for corporate-only bonds", async () => {
    const db = createMockDb();
    expect((await loadSovereignRiskDisclosures(db as unknown as Db, [])).size).toBe(0);
    expect(db.collectionMocks.federalBudget).toBeUndefined();
  });
});
