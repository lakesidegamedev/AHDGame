import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processGeneralTenure } from "./generalTenure";
import { TENURE_POINT_TURNS } from "@/lib/military/generals";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
it.each([false, true])(
  "rolls back interrupted tenure accrual and grants the interval once, afterWrite=%s",
  async (afterWrite) => {
    const f = createTransactionalMemoryDb();
    f.memory.seed("gameState", [
      { _id: "current", currentTurn: TENURE_POINT_TURNS, worldEpochId: "world" },
    ]);
    f.memory.seed("characterGenerals", [
      {
        _id: new ObjectId(),
        characterId: "one",
        commissioned: true,
        general: { level: 1, xp: 50, pts: 4, lastTenurePointTurn: 0, gtraits: ["tr1"] },
      },
    ]);
    const fault = withInjectedCrash(f.memory, {
      collection: "characterGenerals",
      op: "bulkWrite",
      onCall: 1,
      afterWrite,
    });
    Object.assign(fault.db, { client: f.db.client });
    await expect(processGeneralTenure(fault.db, TENURE_POINT_TURNS)).rejects.toThrow();
    expect(f.memory.collection("characterGenerals").docs[0].general).toMatchObject({
      pts: 4,
      xp: 50,
      lastTenurePointTurn: 0,
    });
    await Promise.all([
      processGeneralTenure(f.db, TENURE_POINT_TURNS),
      processGeneralTenure(f.db, TENURE_POINT_TURNS),
    ]);
    expect(f.memory.collection("characterGenerals").docs[0].general).toMatchObject({
      pts: 5,
      xp: 50,
      gtraits: ["tr1"],
      lastTenurePointTurn: TENURE_POINT_TURNS,
    });
  }
);
