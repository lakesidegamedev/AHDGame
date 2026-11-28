import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({
  requireAdmin: async () => ({ ok: true, admin: { userId: "000000000000000000000001" } }),
}));
describe("imperial starter creation", () => {
  it.each([
    ["imperialCharacters", "insertOne"],
    ["corporations", "insertOne"],
    ["users", "updateOne"],
  ] as const)(
    "rolls back landed %s delivery and creates one funded starter on retry",
    async (collection, op) => {
      const f = createTransactionalMemoryDb();
      f.memory.seed("gameState", [
        { _id: "current", currentTurn: 5, worldEpochId: "owned-imperial" },
      ]);
      f.memory.seed("users", [{ _id: new ObjectId("000000000000000000000001") }]);
      const req = () =>
        new Request("http://local/api/imperial-characters", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            countryId: "UK",
            name: "Test Monarch",
            gender: "female",
            royalHouse: "Test House",
            homeState: "London",
          }),
        });
      const fault = withInjectedCrash(f.memory, { collection, op, onCall: 1, afterWrite: true });
      vi.mocked(getDb).mockResolvedValue(fault.db);
      expect((await POST(req())).ok).toBe(false);
      expect(fault.crashed).toBe(true);
      expect(f.memory.collection("imperialCharacters").docs).toHaveLength(0);
      expect(f.memory.collection("corporations").docs).toHaveLength(0);
      vi.mocked(getDb).mockResolvedValue(f.db);
      const results = await Promise.all([POST(req()), POST(req())]);
      expect(results.filter((row) => row.ok)).toHaveLength(1);
      expect(f.memory.collection("imperialCharacters").docs).toHaveLength(1);
      expect(f.memory.collection("corporations").docs).toHaveLength(1);
      expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(50000000);
    }
  );
});
