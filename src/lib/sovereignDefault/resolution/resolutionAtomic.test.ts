vi.mock("@/lib/ledger/featureFlag", () => ({ isLedgerShadowEnabled: async () => true }));
import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { applyBailoutResolution } from "./bailout";
import { applyMonetizeResolution } from "./monetize";
import { applyRepudiateResolution } from "./repudiate";
import { applyRestructureResolution } from "./restructure";
import { getImfCorporation } from "@/lib/imf/resolveImfCorporation";
import { processSovereignLegislativeTurn } from "../legislative/legislativeTurn";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/news", () => ({ createSystemNewsPost: vi.fn() }));
vi.mock("../crisisNews", () => ({
  emitBailoutGrantedNews: vi.fn(),
  emitMonetizedNews: vi.fn(),
  emitRepudiatedNews: vi.fn(),
  emitRestructuredNews: vi.fn(),
}));
vi.mock("../cascade/cascadeNews", () => ({
  emitCascadeSummaryNews: vi.fn(),
  emitMassCascadeAlert: vi.fn(),
}));
vi.mock("@/lib/imf/resolveImfCorporation", () => ({
  getImfCorporation: vi.fn().mockResolvedValue({ _id: new ObjectId() }),
}));
vi.mock("@/lib/bonds/sovereign", async (original) => ({
  ...(await original<typeof import("@/lib/bonds/sovereign")>()),
  calculateSovereignRolloverAmount: vi.fn().mockResolvedValue(1000),
}));
const actions = {
  bailout: applyBailoutResolution,
  monetize: applyMonetizeResolution,
  repudiate: applyRepudiateResolution,
  restructure: applyRestructureResolution,
};
function fixture(choice: keyof typeof actions) {
  const f = createTransactionalMemoryDb();
  const decisionId = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
  f.memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      sovereignCrisisState: "crisisResolving",
      treasuryCashLocal: 5000,
      gdp: 100000,
      surplus: -100,
      debt: { principal: 1000, interestRate: 3, ceiling: 100000 },
      economicFactors: { inflationRate: 2 },
    },
  ]);
  f.memory.seed("exchangeRates", [{ _id: "US", currencyCode: "USD", rate: 1 }]);
  f.memory.seed("sovereignCrisisDecisions", [
    {
      _id: decisionId,
      countryCode: "US",
      state: "executiveProposed",
      executiveChoice: choice,
      currentChamberIndex: 0,
      legislativePhases: [
        {
          chamberKey: "senate",
          outcome: "pending",
          endsOnTurn: 5,
          votesFor: 5,
          votesAgainst: 0,
          votes: {},
        },
      ],
    },
  ]);
  f.memory.seed("bonds", [
    {
      _id: new ObjectId(),
      issuerType: "sovereign",
      countryId: "US",
      matured: false,
      defaulted: false,
      totalIssued: 1000,
      maturityTurn: 100,
      marketPrice: 1,
      holders: [],
      publicFloat: 1,
    },
  ]);
  return {
    ...f,
    input: {
      countryCode: "US" as const,
      currentTurn: 5,
      realtimeMs: 1000,
      decisionId,
      executiveCharacterId: null,
    },
  };
}
describe("sovereign resolution atomicity", () => {
  it.each(Object.keys(actions) as (keyof typeof actions)[])(
    "rolls back %s after budget effects and retries once",
    async (choice) => {
      const f = fixture(choice);
      const fault = withInjectedCrash(f.memory, {
        collection: "sovereignCrisisDecisions",
        op: "updateOne",
        onCall: 1,
        afterWrite: true,
      });
      await expect(actions[choice](fault.db, f.input)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
        sovereignCrisisState: "crisisResolving",
        treasuryCashLocal: 5000,
      });
      expect(f.memory.collection("exchangeRates").docs[0].rate).toBe(1);
      expect(f.memory.collection("bonds").docs[0]).toMatchObject({
        defaulted: false,
        maturityTurn: 100,
        marketPrice: 1,
      });
      const results = await Promise.all([
        actions[choice](f.db, f.input),
        actions[choice](f.db, f.input),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
        sovereignCrisisState: "recovering",
        treasuryCashLocal: 5000,
      });
      expect(f.memory.collection("sovereignCrisisDecisions").docs[0].state).toBe("ratified");
    }
  );
  it("retries a rejected chamber after an interruption without finalizing an unpaid resolution", async () => {
    const f = fixture("repudiate");
    await f.db
      .collection("sovereignCrisisDecisions")
      .updateOne(
        { _id: f.input.decisionId },
        { $set: { "legislativePhases.0.votesFor": 0, "legislativePhases.0.votesAgainst": 5 } }
      );
    const fault = withInjectedCrash(f.memory, {
      collection: "federalBudget",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(processSovereignLegislativeTurn(fault.db, 1000, 5)).rejects.toThrow();
    expect(f.memory.collection("sovereignCrisisDecisions").docs[0].state).toBe("executiveProposed");
    const results = await Promise.all([
      processSovereignLegislativeTurn(f.db, 1000, 5),
      processSovereignLegislativeTurn(f.db, 1000, 5),
    ]);
    expect(results.flatMap((result) => result.rejected)).toEqual(["US"]);
    expect(f.memory.collection("sovereignCrisisDecisions").docs[0].state).toBe("rejected");
    expect(f.memory.collection("federalBudget").docs[0].sovereignCrisisState).toBe("recovering");
  });
});

describe("funded sovereign recovery", () => {
  function funded(choice: "bailout" | "monetize", cash = 10000) {
    const f = fixture(choice),
      lender = {
        _id: new ObjectId(),
        name: "IMF",
        countryId: "US",
        liquidCurrencyCode: "USD",
        liquidCapital: cash,
      };
    f.memory.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: true }]);
    f.memory.seed("corporations", [lender]);
    vi.mocked(getImfCorporation).mockImplementation(
      async (db) => (await db.collection("corporations").findOne({ _id: lender._id })) as never
    );
    f.memory.collection("exchangeRates").docs.length = 0;
    f.memory.seed("exchangeRates", [
      { _id: "US", currencyCode: "USD", rate: 2 },
      { _id: "CA", currencyCode: "CAD", rate: 2.8 },
    ]);
    return { ...f, lender };
  }
  it.each(["bailout", "monetize"] as const)(
    "rolls back delivered %s cash and retries once",
    async (choice) => {
      const f = funded(choice);
      const fault = withInjectedCrash(f.memory, {
        collection: "sovereignCrisisDecisions",
        op: "updateOne",
        onCall: 1,
        afterWrite: true,
      });
      await expect(actions[choice](fault.db, f.input)).rejects.toThrow();
      expect(fault.crashed).toBe(true);
      expect(f.memory.collection("federalBudget").docs[0].treasuryCashLocal).toBe(5000);
      expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(10000);
      expect(f.memory.collection("bankMoneyMoves").docs).toHaveLength(0);
      const results = await Promise.all([
        actions[choice](f.db, f.input),
        actions[choice](f.db, f.input),
      ]);
      expect(results.filter((row) => row.ok)).toHaveLength(1);
      expect(f.memory.collection("federalBudget").docs[0].treasuryCashLocal).toBe(6100);
      expect(f.memory.collection("corporations").docs[0].liquidCapital).toBe(
        choice === "bailout" ? 8900 : 10000
      );
      expect(f.memory.collection("bankMoneyMoves").docs).toHaveLength(1);
    }
  );
  it("conserves anchor cash across a CAD Treasury and USD lender", async () => {
    const f = funded("bailout");
    await f.db.collection("federalBudget").updateOne({}, { $set: { currencyCode: "CAD" } });
    expect((await applyBailoutResolution(f.db, f.input)).ok).toBe(true);
    const government = Number(f.memory.collection("federalBudget").docs[0].treasuryCashLocal);
    const lender = Number(f.memory.collection("corporations").docs[0].liquidCapital);
    expect(government).toBe(6100);
    expect(government / 2.8 + lender / 2).toBeCloseTo(5000 / 2.8 + 10000 / 2, 8);
    const entries = f.memory.collection("ledgerEntries").docs;
    const primary = (account: string) =>
      entries
        .flatMap(
          (row) => (row.legs ?? []) as { account: string; role?: string; anchorAmount: number }[]
        )
        .filter((leg) => leg.account === account && leg.role === "primary")
        .reduce((n, leg) => n + leg.anchorAmount, 0);
    expect(primary("government:US:CAD")).toBeCloseTo(1100 / 2.8, 8);
    expect(primary("government_cash:US:CAD")).toBeCloseTo(1100 / 2.8, 8);
    expect(primary(`corporation:${f.lender._id.toHexString()}:USD`)).toBeCloseTo(-1100 / 2.8, 8);
  });
  it("does not activate or book a facility when the IMF cannot fund it", async () => {
    const f = funded("bailout", 1);
    expect(await applyBailoutResolution(f.db, f.input)).toMatchObject({
      ok: false,
      reason: "insufficient-imf-funds",
    });
    expect(f.memory.collection("federalBudget").docs[0]).toMatchObject({
      sovereignCrisisState: "crisisResolving",
      treasuryCashLocal: 5000,
    });
    expect(f.memory.collection("bankMoneyMoves").docs).toHaveLength(0);
  });
});
