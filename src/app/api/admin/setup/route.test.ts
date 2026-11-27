import { beforeEach, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { POST } from "./route";
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: async () => ({ ok: true }) }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/turnSystem", () => ({ initializeGameState: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it.each([
  "{",
  JSON.stringify({ scope: "CA" }),
  JSON.stringify({ scope: "not-country" }),
  JSON.stringify({ scpoe: "US" }),
])("refuses invalid or unsupported setup requests", async (body) => {
  expect(
    (
      await POST(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      )
    ).status
  ).toBe(400);
  const { getDb } = await import("@/lib/mongodb");
  expect(getDb).not.toHaveBeenCalled();
});
it("cannot overwrite fiscal or asset data in an initialized world", async () => {
  const memory = createInMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 1, preset: "2027-default" }]);
  memory.seed("federalBudget", [
    { _id: "CA", treasuryBalance: 123456, taxRates: { incomeTax: 12 } },
  ]);
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(memory as never);
  const response = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "all" }),
    })
  );
  expect(response.status).toBe(409);
  expect(memory.collection("federalBudget").docs[0]).toEqual({
    _id: "CA",
    treasuryBalance: 123456,
    taxRates: { incomeTax: 12 },
  });
});
