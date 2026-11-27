import { beforeEach, expect, it, vi } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { TURN_HOLDER_ID } from "./turnLockHolder";
import { localTurnLock, releaseLocalProcessingLock } from "./turnInitialization";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn(), invalidateGameStateCache: vi.fn() }));
beforeEach(() => {
  localTurnLock.held = true;
});
it("cannot clear a replacement that acquires the lock after the shutdown read", async () => {
  const db = createInMemoryDb();
  db.seed("gameState", [
    {
      _id: "current",
      isProcessing: true,
      processingHolderId: TURN_HOLDER_ID,
      processingPhase: null,
    },
  ]);
  const collection = db.collection("gameState"),
    read = collection.findOne.bind(collection);
  vi.spyOn(collection, "findOne").mockImplementationOnce(async (...args) => {
    const snapshot = await read(...args);
    collection.docs[0].processingHolderId = "replacement";
    collection.docs[0].processingPhase = "corporationTurn";
    return snapshot;
  });
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as never);
  expect(await releaseLocalProcessingLock("test takeover")).toBe(false);
  expect(collection.docs[0]).toMatchObject({
    isProcessing: true,
    processingHolderId: "replacement",
    processingPhase: "corporationTurn",
  });
  expect(collection.docs[0].processingAbandonedAt).toBeUndefined();
});
it.each(["corporationTurn", null])(
  "does not touch a replacement worker at phase %s",
  async (processingPhase) => {
    const db = createInMemoryDb();
    const row = {
      _id: "current",
      isProcessing: true,
      processingHolderId: "replacement",
      processingPhase,
    };
    db.seed("gameState", [row]);
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as never);
    expect(await releaseLocalProcessingLock("test shutdown")).toBe(false);
    expect(db.collection("gameState").docs[0]).toEqual(row);
  }
);
it.each(["corporationTurn", null])(
  "releases only its own phase %s and preserves committed evidence",
  async (processingPhase) => {
    const db = createInMemoryDb();
    db.seed("gameState", [
      { _id: "current", isProcessing: true, processingHolderId: TURN_HOLDER_ID, processingPhase },
    ]);
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as never);
    expect(await releaseLocalProcessingLock("test shutdown")).toBe(true);
    const row = db.collection("gameState").docs[0];
    expect(row.isProcessing).toBe(processingPhase !== null);
    if (processingPhase) {
      expect(row.processingPhase).toBe(processingPhase);
      expect(row.processingAbandonedAt).toBeInstanceOf(Date);
    }
  }
);
