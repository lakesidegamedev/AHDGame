import { beforeEach, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { POST } from "./route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({
  requireAdmin: async () => ({ ok: true, admin: { username: "test" } }),
}));
vi.mock("@/lib/currency/migration", () => ({
  migrateCharacterBalances: vi.fn(async () => ({ processed: 0, skipped: 0 })),
  seedExchangeRates: vi.fn(async () => {}),
  migrateCorporationLiquidCapital: vi.fn(async () => ({ processed: 0, skipped: 0 })),
  updateCentralBanks: vi.fn(async () => {}),
  createForexIndexes: vi.fn(async () => {}),
}));
let memory: ReturnType<typeof createInMemoryDb>;
beforeEach(async () => {
  vi.clearAllMocks();
  memory = createInMemoryDb();
  memory.seed("gameState", [
    {
      _id: "current",
      isProcessing: false,
      forexEnabled: false,
      currentTurn: 100,
      worldEpochId: "test",
      preset: "2027-default",
    },
  ]);
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(memory as never);
});
it("an intervening turn acquisition wins without being overwritten or migrated", async () => {
  const c = memory.collection("gameState"),
    update = c.updateOne.bind(c);
  vi.spyOn(c, "updateOne").mockImplementationOnce(async (filter, change) => {
    await update(
      { _id: "current" },
      { $set: { isProcessing: true, processingHolderId: "turn", processingKind: "turn" } }
    );
    return update(filter, change);
  });
  expect((await POST()).status).toBe(409);
  expect(c.docs[0].processingHolderId).toBe("turn");
  const { migrateCharacterBalances } = await import("@/lib/currency/migration");
  expect(migrateCharacterBalances).not.toHaveBeenCalled();
});
it.each([true, false])(
  "a replacement holder survives migration completion or failure (%s)",
  async (fail) => {
    const { migrateCharacterBalances } = await import("@/lib/currency/migration");
    vi.mocked(migrateCharacterBalances).mockImplementationOnce(async () => {
      await memory
        .collection("gameState")
        .updateOne(
          { _id: "current" },
          { $set: { processingHolderId: "replacement", processingKind: "turn" } }
        );
      if (fail) throw new Error("Migration interrupted");
      return { processed: 0, skipped: 0 };
    });
    expect((await POST()).status).toBe(fail ? 500 : 409);
    expect(memory.collection("gameState").docs[0]).toMatchObject({
      isProcessing: true,
      processingHolderId: "replacement",
      forexEnabled: false,
    });
    const { seedExchangeRates } = await import("@/lib/currency/migration");
    expect(seedExchangeRates).not.toHaveBeenCalled();
  }
);
it("lost lock-admission acknowledgement releases only its own unused claim", async () => {
  const fault = withInjectedCrash(memory, {
    collection: "gameState",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(fault.db);
  expect((await POST()).status).toBe(500);
  expect(fault.crashed).toBe(true);
  expect(memory.collection("gameState").docs[0]).toMatchObject({
    isProcessing: false,
    forexEnabled: false,
  });
});
