import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import type { Corporation } from "@/lib/db/types";
import { fileListingPetition } from "./service";
vi.mock("@/lib/corporations/mergerReview/authority", () => ({
  resolveMergerAuthority: vi.fn(async () => ({
    seatId: "commerce",
    seatName: "Committee",
    holderCharacterId: new ObjectId("000000000000000000000002"),
  })),
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn(async () => false) }));
vi.mock("@/lib/currency/corporationCapital", async (original) => ({
  ...(await original<typeof import("@/lib/currency/corporationCapital")>()),
  getCorpFxRate: vi.fn(async () => 1),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn(async () => {}) }));
describe("atomic petition filing", () => {
  it("restores payer and pending publication after a failed recipient credit and retries once", async () => {
    const { memory } = createTransactionalMemoryDb();
    const ceoId = new ObjectId();
    const corporation = {
      _id: new ObjectId(),
      ceoId,
      countryId: "US",
      name: "Fixture",
      liquidCapital: 1000,
      liquidCurrencyCode: "USD",
      isPrivate: false,
    } as Corporation;
    memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
    memory.seed("corporations", [{ ...corporation }]);
    memory.seed("characters", [{ _id: new ObjectId("000000000000000000000002"), cashOnHand: 0 }]);
    const fault = withInjectedCrash(memory, {
      collection: "characters",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    const run = () =>
      fileListingPetition({
        db: fault.db,
        corporation,
        filedByCharacterId: ceoId,
        contributionAnchor: 100,
        currentTurn: 5,
        currentYear: 2027,
      });
    await expect(run()).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(1000);
    expect(memory.collection("characters").docs[0].cashOnHand).toBe(0);
    expect(memory.collection("indexListingPetitions").docs).toHaveLength(0);
    expect((await run()).ok).toBe(true);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(900);
    expect(memory.collection("characters").docs[0].cashOnHand).toBe(100);
    expect((await run()).ok).toBe(false);
    expect(memory.collection("corporations").docs[0].liquidCapital).toBe(900);
  });
});
