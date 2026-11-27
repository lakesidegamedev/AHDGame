import { expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { evaluateSovereignAuctionForCountry } from "./crisisDetection";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("./requiredIssuance", () => ({ computeRequiredIssuance: vi.fn(async () => 100) }));
vi.mock("./snapshotLoader", () => ({
  loadCountrySovereignSnapshot: vi.fn(async () => ({ debtToGdp: 1 })),
}));
vi.mock("./marketDemand", () => ({ computeMarketDemand: vi.fn(() => ({ demandRatio: 0.2 })) }));
vi.mock("@/lib/countryAccess", () => ({
  getCountryAccessFromDb: vi.fn(async () => ({ enabledForPlayers: true })),
}));
vi.mock("./crisisNews", () => ({
  emitCrisisFiredNews: vi.fn(async () => {}),
  emitAuctionUndersubscribedNews: vi.fn(async () => {}),
  emitAuctionFailedNews: vi.fn(async () => {}),
}));
vi.mock("./npc/npcExecutiveAutoPropose", () => ({
  npcExecutiveAutoPropose: vi.fn(async () => ({ ok: false })),
}));
vi.mock("./political/applyPopulistSurge", () => ({
  applyPopulistSurgeOnCrisis: vi.fn(async () => ({ npcsAffected: 0 })),
}));
it("commits the crisis state and decision together, preserving the first outcome across interruptions and races", async () => {
  const { db, memory } = createTransactionalMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 100 }]);
  memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      sovereignCrisisState: "normal",
      failedAuctionConsecutiveCount: 2,
    },
  ]);
  const fault = withInjectedCrash(memory, {
    collection: "sovereignCrisisDecisions",
    op: "insertOne",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  await expect(evaluateSovereignAuctionForCountry(fault.db, "US", 100, 1000)).rejects.toThrow();
  expect(memory.collection("federalBudget").docs[0]).toMatchObject({
    sovereignCrisisState: "normal",
    failedAuctionConsecutiveCount: 2,
  });
  expect(memory.collection("sovereignCrisisDecisions").docs).toHaveLength(0);
  fault.disarm();
  const reports = await Promise.all([
    evaluateSovereignAuctionForCountry(db, "US", 100, 1000),
    evaluateSovereignAuctionForCountry(db, "US", 100, 2000),
  ]);
  expect(reports[0]).toEqual(reports[1]);
  expect(memory.collection("federalBudget").docs[0]).toMatchObject({
    sovereignCrisisState: "crisisPending",
    failedAuctionConsecutiveCount: 3,
  });
  expect(memory.collection("sovereignCrisisDecisions").docs).toHaveLength(1);
});
