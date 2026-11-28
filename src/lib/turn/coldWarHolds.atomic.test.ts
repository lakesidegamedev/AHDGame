import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
vi.mock("@/lib/analytics/serverPosthog", () => ({ captureServerGameEvent: vi.fn(async () => {}) }));
import { captureServerGameEvent } from "@/lib/analytics/serverPosthog";
import { resolveColdWarHolds } from "./coldWarHolds";
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      currentYear: 1955,
      startingYear: 1953,
      preset: "1953-default",
      worldEpochId: "synthetic-hold",
    },
  ]);
  f.memory.seed("conflicts", [
    {
      _id: "synthetic-war",
      name: "Synthetic War",
      type: "cold_war",
      status: "active",
      hostCountry: "SVN",
      hostEntities: ["SVN"],
      poleSide: "B",
      poleSinceTurn: 90,
      sideA: { label: "A", countries: ["US"], backer: "west" },
      sideB: { label: "B", countries: ["RU"], backer: "east" },
    },
  ]);
  f.memory.seed("countryAlignments", [
    {
      _id: new ObjectId(),
      entityId: "SVN",
      shares: { WEST: 50, EAST: 10 },
      nonAligned: 40,
      turn: 99,
    },
  ]);
  return f;
}
describe("proxy outcome effects and terminal state", () => {
  it.each([
    { collection: "conflicts", op: "updateOne" as const },
    { collection: "organizationMemberships", op: "updateOne" as const },
    { collection: "countryAlignments", op: "updateOne" as const },
    { collection: "bankMoneyMoves", op: "insertOne" as const },
  ])("retries a landed $collection.$op", async (point) => {
    const { db, memory } = fixture();
    vi.mocked(captureServerGameEvent).mockClear();
    const original = await db.collection("countryAlignments").findOne({});
    const fault = withInjectedCrash(memory, { ...point, onCall: 1, afterWrite: true });
    await expect(resolveColdWarHolds(fault.db, 100)).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect((await db.collection("conflicts").findOne({}))!.status).toBe("active");
    expect(await db.collection("countryAlignments").findOne({})).toEqual(original);
    expect(captureServerGameEvent).not.toHaveBeenCalled();
    const first = await resolveColdWarHolds(db, 100);
    expect(first.resolved).toBe(1);
    const after = await db.collection("countryAlignments").findOne({});
    expect(after).not.toEqual(original);
    expect(await resolveColdWarHolds(db, 100)).toEqual(first);
    expect(await db.collection("countryAlignments").findOne({})).toEqual(after);
    expect(await db.collection("organizationMemberships").countDocuments({})).toBe(1);
    expect(captureServerGameEvent).toHaveBeenCalledTimes(1);
  });
  it("overlapping resolutions award one alignment swing", async () => {
    const { db } = fixture();
    const result = await Promise.all([resolveColdWarHolds(db, 100), resolveColdWarHolds(db, 100)]);
    expect(result[0]).toEqual(result[1]);
    expect(
      await db.collection("bankMoneyMoves").countDocuments({ phase: "cold-war-hold-resolution" })
    ).toBe(1);
  });
});
