import { expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { getDb } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/budget/revenue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/budget/revenue")>()),
  calculateFederalRevenue: vi.fn(async () => ({ total: 100 })),
}));
it("does not apply foreign signed bills to the US budget while preserving legacy US records", async () => {
  const f = createTransactionalMemoryDb();
  vi.mocked(getDb).mockResolvedValue(f.db);
  vi.mocked(requireAdmin).mockResolvedValue({ ok: true } as never);
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
  f.memory.seed("federalBudget", [
    { _id: "federal", taxRates: { salesTax: 1 }, spending: { total: 50 } },
  ]);
  f.memory.seed("legislationTypes", [
    {
      _id: "tax",
      name: "Tax",
      taxRateChange: { scope: "federal", taxType: "salesTax" },
      policyOptions: [
        { id: "us", rate: 7 },
        { id: "ca", rate: 99 },
      ],
    },
  ]);
  f.memory.seed("bills", [
    {
      _id: "legacy-us",
      title: "US",
      status: "signed",
      provisions: [{ legislationTypeId: "tax", policyOptionId: "us" }],
    },
    {
      _id: "ca",
      title: "Canada",
      countryId: "CA",
      status: "signed",
      provisions: [{ legislationTypeId: "tax", policyOptionId: "ca" }],
    },
  ]);
  const response = await POST();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.changes).toHaveLength(1);
  expect(body.newRates.salesTax).toBe(7);
});
