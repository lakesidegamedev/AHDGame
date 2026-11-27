import { describe, expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
vi.mock("@/lib/analytics/serverPosthog", () => ({ captureServerGameEvent: vi.fn(async () => {}) }));
import { captureServerGameEvent } from "@/lib/analytics/serverPosthog";
import { resolvePeaceWindows } from "./peaceWindows";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 99, worldEpochId: "synthetic-peace" },
  ]);
  f.memory.seed("conflicts", [
    {
      _id: "war",
      status: "terms_pending",
      hostCountry: "TR",
      type: "war",
      sideA: { label: "A", countries: ["UK"] },
      sideB: { label: "B", countries: ["TR"] },
      termsWindow: { victor: "A", imposer: "UK", target: "TR", closesTurn: 100 },
    },
  ]);
  return f;
}
describe("expired peace window effects", () => {
  it.each(["conflicts", "truces", "bankMoneyMoves"])(
    "retries a landed %s write without losing settlement or truce",
    async (collection) => {
      const f = fixture();
      vi.mocked(captureServerGameEvent).mockClear();
      const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
      await expect(resolvePeaceWindows(fault.db, 100)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect((await f.db.collection("conflicts").findOne({}))!.status).toBe("terms_pending");
      expect(captureServerGameEvent).not.toHaveBeenCalled();
      const result = await resolvePeaceWindows(f.db, 100);
      expect(await resolvePeaceWindows(f.db, 100)).toEqual(result);
      expect(result.resolved).toBe(1);
      expect((await f.db.collection("conflicts").findOne({}))!.settlement.term.amount).toBe(0);
      expect(await f.db.collection("truces").countDocuments({})).toBe(1);
      expect(captureServerGameEvent).toHaveBeenCalledTimes(1);
    }
  );
});
