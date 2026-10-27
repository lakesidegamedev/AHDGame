import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { Bond } from "@/lib/db/types/bond";
import { settleFundedSovereignBondMaturity } from "./sovereign";
import { settleSovereignBondMaturityBond } from "./sovereignMaturityBond";
import { planSovereignMaturityRefunding } from "./rules/sovereignMaturityRefunding";

vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: async (body: (session: unknown) => Promise<unknown>) => body({} as never),
}));

const NOW = new Date("2026-10-27T00:00:00Z");
const bankId = new ObjectId("650000000000000000000009");

function world(opts: { treasuryCash: number; poolCash?: number }): InMemoryDb {
  const memory = createInMemoryDb();
  memory.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: true }]);
  memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      currencyCode: "USD",
      treasuryBalance: -50_000,
      treasuryCashLocal: opts.treasuryCash,
      debt: { principal: 10_000, ceiling: 10_000 },
      spending: { total: 800, debtInterest: 800 },
      surplus: 0,
      revenue: { total: 100 },
      gdp: 100_000,
    },
  ]);
  memory.seed("centralBanks", [{ _id: "US", primeRate: 6 }]);
  memory.seed("bondMarketPools", [{ _id: "USD", cashLocal: opts.poolCash ?? 1_000_000 }]);
  return memory;
}

function cashHolderBond(memory: InMemoryDb) {
  const holderId = new ObjectId();
  const npcId = new ObjectId();
  memory.seed("characters", [{ _id: holderId, cashOnHand: 0 }]);
  memory.seed("npps", [{ _id: npcId, cash: 0 }]);
  const bond = {
    _id: new ObjectId(),
    corporationId: new ObjectId(),
    issuerName: "Fixture Treasury",
    issuerType: "sovereign",
    countryId: "US",
    currencyCode: "USD",
    totalIssued: 10_000,
    couponRate: 8,
    maturityTurn: 24,
    matured: false,
    defaulted: false,
    holders: [
      { characterId: holderId, units: 6 },
      { nppId: npcId, units: 4 },
    ],
    publicFloat: 0,
  } as unknown as Bond;
  memory.seed("bonds", [bond] as unknown as Record<string, unknown>[]);
  const args = {
    bond,
    turn: 30,
    dueTurn: 24,
    currencyCode: "USD" as const,
    treasuryLocalPerAnchor: 1,
    nonBankRepaymentLocal: 10_000,
    holderLegs: [
      {
        collection: "characters",
        filter: { _id: holderId },
        path: "cashOnHand",
        amount: 6_000,
        currencyCode: "USD" as const,
        localPerAnchor: 1,
        note: "Pay the character holder",
      },
      {
        collection: "npps",
        filter: { _id: npcId },
        path: "cash",
        amount: 4_000,
        currencyCode: "USD" as const,
        localPerAnchor: 1,
        note: "Pay the NPP holder",
      },
    ],
    now: NOW,
  };
  return { bond, args };
}

function principal(memory: InMemoryDb): number {
  return (memory.collection("federalBudget").docs[0]!.debt as { principal: number }).principal;
}

describe("sovereign maturity refunding plan", () => {
  it("rounds up to whole units and caps at the retiring face and market capacity", () => {
    expect(
      planSovereignMaturityRefunding({
        shortfallLocal: 1_500,
        retiringFaceLocal: 10_000,
        alreadyRefundedLocal: 0,
        marketCapacityUnits: 100,
      })
    ).toEqual({ units: 2, faceLocal: 2_000 });
    expect(
      planSovereignMaturityRefunding({
        shortfallLocal: 9_000,
        retiringFaceLocal: 10_000,
        alreadyRefundedLocal: 4_000,
        marketCapacityUnits: 100,
      })
    ).toEqual({ units: 6, faceLocal: 6_000 });
    expect(
      planSovereignMaturityRefunding({
        shortfallLocal: 9_000,
        retiringFaceLocal: 10_000,
        alreadyRefundedLocal: 10_000,
        marketCapacityUnits: 100,
      }).refusal
    ).toBe("cap_exhausted");
    expect(
      planSovereignMaturityRefunding({
        shortfallLocal: 9_000,
        retiringFaceLocal: 10_000,
        alreadyRefundedLocal: 0,
        marketCapacityUnits: 0,
      }).refusal
    ).toBe("no_market_capacity");
  });
});

describe("unfunded sovereign maturity refinances instead of stalling", () => {
  it("sells a refunding issue to the market and pays every holder principal", async () => {
    const memory = world({ treasuryCash: 500 });
    const { bond, args } = cashHolderBond(memory);
    const result = await settleFundedSovereignBondMaturity(memory as unknown as Db, args);

    expect(result?.status).toBe("applied");
    expect(memory.collection("characters").docs[0]?.cashOnHand).toBe(6_000);
    expect(memory.collection("npps").docs[0]?.cash).toBe(4_000);
    const bonds = memory.collection("bonds").docs;
    const old = bonds.find((row) => String(row._id) === bond._id.toHexString())!;
    const refunding = bonds.find((row) => String(row._id) !== bond._id.toHexString())!;
    expect(old).toMatchObject({
      matured: true,
      sovereignMaturityClaim: { paid: true, refundedFaceLocal: 10_000 },
    });
    // Shortfall 9_500 rounds up to 10 whole units, capped at the retiring face.
    expect(refunding).toMatchObject({
      issuerType: "sovereign",
      countryId: "US",
      totalIssued: 10_000,
      publicFloat: 10,
      unsoldUnits: 0,
      matured: false,
      maturityTurn: 78,
      refundsSovereignMaturityClaimId: `sovereign-maturity:${bond._id.toHexString()}:24`,
    });
    // The pool bought the new paper with its own cash.
    expect(memory.collection("bondMarketPools").docs[0]?.cashLocal).toBe(990_000);
    const budget = memory.collection("federalBudget").docs[0]!;
    // 500 + 10_000 raised - 10_000 paid out.
    expect(budget.treasuryCashLocal).toBe(500);
    // Refinanced, not added: principal is unchanged and still at the ceiling.
    expect(principal(memory)).toBe(10_000);
    expect(memory.collection("bankMoneyMoves").docs.map((row) => row.status)).not.toContain(
      "rejected"
    );
  });

  it("leaves a funded maturity on the ordinary cash path", async () => {
    const memory = world({ treasuryCash: 10_000 });
    const { args } = cashHolderBond(memory);
    const result = await settleFundedSovereignBondMaturity(memory as unknown as Db, args);
    expect(result?.status).toBe("applied");
    expect(memory.collection("bonds").docs).toHaveLength(1);
    expect(memory.collection("bondMarketPools").docs[0]?.cashLocal).toBe(1_000_000);
    expect(memory.collection("federalBudget").docs[0]?.treasuryCashLocal).toBe(0);
    expect(principal(memory)).toBe(0);
  });

  it("is replay safe: a second pass sells nothing and pays nobody twice", async () => {
    const memory = world({ treasuryCash: 500 });
    const { args } = cashHolderBond(memory);
    await settleFundedSovereignBondMaturity(memory as unknown as Db, args);
    const bonds = JSON.stringify(memory.collection("bonds").docs);
    const pool = memory.collection("bondMarketPools").docs[0]?.cashLocal;
    const replay = await settleFundedSovereignBondMaturity(memory as unknown as Db, args);
    expect(replay?.status === "applied" || replay?.status === "replayed").toBe(true);
    expect(JSON.stringify(memory.collection("bonds").docs)).toBe(bonds);
    expect(memory.collection("bondMarketPools").docs[0]?.cashLocal).toBe(pool);
    expect(memory.collection("characters").docs[0]?.cashOnHand).toBe(6_000);
    expect(principal(memory)).toBe(10_000);
  });

  it("waits without defaulting when the market has no cash, then refinances later", async () => {
    const memory = world({ treasuryCash: 0, poolCash: 0 });
    const { bond, args } = cashHolderBond(memory);
    expect(await settleFundedSovereignBondMaturity(memory as unknown as Db, args)).toBeNull();
    expect(memory.collection("bonds").docs).toHaveLength(1);
    expect(memory.collection("bonds").docs[0]).toMatchObject({ matured: false, defaulted: false });

    memory.collection("bondMarketPools").docs[0]!.cashLocal = 1_000_000;
    const fresh = memory
      .collection("bonds")
      .docs.find((row) => String(row._id) === bond._id.toHexString()) as unknown as Bond;
    const later = await settleFundedSovereignBondMaturity(memory as unknown as Db, {
      ...args,
      bond: fresh,
      turn: 31,
    });
    expect(later?.status).toBe("applied");
    expect(memory.collection("characters").docs[0]?.cashOnHand).toBe(6_000);
    expect(principal(memory)).toBe(10_000);
  });
});

describe("bank holder of an unfunded maturity", () => {
  function bankWorld(status: "active" | "failed") {
    const memory = world({ treasuryCash: 100 });
    memory.seed("corporations", [
      {
        _id: bankId,
        bankCharter: {
          status,
          currency: "USD",
          charteredTurn: 4,
          cashReserves: 0,
          ...(status === "failed" ? { failedTurn: 20, resolutionClaimedTurn: 20 } : {}),
        },
      },
    ]);
    const holderId = new ObjectId();
    memory.seed("characters", [{ _id: holderId, cashOnHand: 0 }]);
    const bond = {
      _id: new ObjectId(),
      corporationId: new ObjectId(),
      issuerName: "Fixture Treasury",
      issuerType: "sovereign",
      countryId: "US",
      currencyCode: "USD",
      totalIssued: 10_000,
      couponRate: 8,
      maturityTurn: 24,
      matured: false,
      defaulted: false,
      holders: [
        { bankId, charteredTurn: 4, units: 7, avgCostPerUnit: 1_000 },
        { characterId: holderId, units: 3 },
      ],
      publicFloat: 0,
    } as unknown as Bond;
    memory.seed("bonds", [bond] as unknown as Record<string, unknown>[]);
    const holderLegs = [
      {
        collection: "characters",
        filter: { _id: holderId },
        path: "cashOnHand",
        amount: 3_000,
        currencyCode: "USD" as const,
        localPerAnchor: 1,
        note: "Pay the character holder",
      },
    ];
    const settle = (turn: number) =>
      settleSovereignBondMaturityBond({
        db: memory as unknown as Db,
        bond: memory
          .collection("bonds")
          .docs.find((row) => String(row._id) === bond._id.toHexString()) as unknown as Bond,
        plan: {
          treasuryValuation: {
            anchorRate: 1,
            anchorRateSource: "observed",
            anchorRatePreset: "",
          },
          currencyCode: "USD",
          bankUnits: 7,
          nonBankRepaymentLocal: 3_000,
          holderLegs,
          maturityEntries: [],
        },
        turn,
        now: NOW,
        countryId: "US",
        budgetId: "federal",
        bondCcy: "USD",
        budgetsWithBankClaims: new Set(),
      });
    return { memory, bond, settle };
  }

  it.each(["active", "failed"] as const)(
    "refinances and pays the %s bank's escrow claim, then the other holders",
    async (status) => {
      const { memory, bond, settle } = bankWorld(status);
      const entries = await settle(30);

      expect(entries).not.toBeNull();
      const bank = memory.collection("corporations").docs[0]!;
      expect((bank.bankCharter as { cashReserves: number }).cashReserves).toBe(7_000);
      expect(memory.collection("characters").docs[0]?.cashOnHand).toBe(3_000);
      const budget = memory.collection("federalBudget").docs[0]!;
      expect(budget.bankSovereignClaims).toEqual([]);
      const old = memory
        .collection("bonds")
        .docs.find((row) => String(row._id) === bond._id.toHexString())!;
      expect(old).toMatchObject({ matured: true, sovereignMaturityClaim: { paid: true } });
      const refunded = memory
        .collection("bonds")
        .docs.filter((row) => row.refundsSovereignMaturityClaimId)
        .reduce((sum, row) => sum + Number(row.totalIssued), 0);
      // Bank gap 6_900 rounds up to 7 units; the 2_900 residual gap to 3 units.
      // Together they reach, and never pass, the 10_000 face being retired.
      expect(refunded).toBe(10_000);
      expect(principal(memory)).toBeLessThanOrEqual(10_000);

      // Replay settles nothing new.
      const snapshot = JSON.stringify(memory.collection("bonds").docs);
      await settle(30);
      expect(JSON.stringify(memory.collection("bonds").docs)).toBe(snapshot);
      expect((bank.bankCharter as { cashReserves: number }).cashReserves).toBe(7_000);
    }
  );
});
