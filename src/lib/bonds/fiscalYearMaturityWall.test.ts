import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { Bond } from "@/lib/db/types/bond";
import { BASE_DEMAND } from "@/lib/sovereignDefault/constants";
import { calculateFiscalYear, isFiscalYearEnd } from "@/lib/budget/fiscalYear";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { settleFundedSovereignBondMaturity } from "./sovereign";

vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: async (body: (session: unknown) => Promise<unknown>) => body({} as never),
}));

const NOW = new Date("2026-11-04T00:00:00Z");
const COUNT = 12;
const FACE = 10_000;
const corporationId = new ObjectId("650000000000000000000b01");

/** First turn of a year that closes a fiscal year, so the wall sits on the boundary. */
const BOUNDARY_TURN = (() => {
  for (let turn = TURNS_PER_YEAR * 3; turn < TURNS_PER_YEAR * 4; turn++) {
    if (isFiscalYearEnd(turn)) return turn;
  }
  throw new Error("no fiscal year end found");
})();

type Doc = Record<string, unknown>;

function seedWall() {
  const memory = createInMemoryDb();
  memory.seed("gameConfig", [{ _id: "default", treasuryCashLedgerEnabled: true }]);
  memory.seed("exchangeRates", [{ _id: "USD", currencyCode: "USD", rate: 1 }]);
  memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      currencyCode: "USD",
      treasuryBalance: 0,
      treasuryCashLocal: 0,
      debt: { principal: COUNT * FACE, ceiling: COUNT * FACE * 2 },
      spending: { total: 5_000, debtInterest: 5_000 },
      surplus: 0,
      revenue: { total: 100 },
      gdp: 1_000_000,
    },
  ]);
  memory.seed("centralBanks", [{ _id: "US", primeRate: 6 }]);
  memory.seed("bondMarketPools", [
    { _id: "USD", cashLocal: 10_000_000, appetiteByCountry: { US: BASE_DEMAND / 2 } },
  ]);
  const holderId = new ObjectId();
  memory.seed("characters", [{ _id: holderId, cashOnHand: 0 }]);
  const bonds = Array.from({ length: COUNT }, (_, i) => ({
    _id: new ObjectId(`6700000000000000000${String(i).padStart(5, "0")}`),
    corporationId,
    issuerName: "Fixture Treasury",
    issuerType: "sovereign",
    countryId: "US",
    currencyCode: "USD",
    faceValue: 1_000,
    totalIssued: FACE,
    couponRate: 5,
    maturityTurns: 48,
    issuedAtTurn: BOUNDARY_TURN - 48,
    maturityTurn: BOUNDARY_TURN,
    marketPrice: 1,
    matured: false,
    defaulted: false,
    restructureHaircutPercent: null,
    holders: [{ characterId: holderId, units: 4 }],
    publicFloat: 6,
  }));
  memory.seed("bonds", bonds as unknown as Doc[]);
  return { memory, holderId, bonds };
}

const num = (v: unknown) => v as number;

function totals(memory: ReturnType<typeof createInMemoryDb>) {
  const budget = memory.collection("federalBudget").docs[0]! as Doc;
  const live = (memory.collection("bonds").docs as unknown as Bond[]).filter((b) => !b.matured);
  return {
    treasury: num(budget.treasuryCashLocal),
    pool: num((memory.collection("bondMarketPools").docs[0] as Doc).cashLocal),
    holder: num((memory.collection("characters").docs[0] as Doc).cashOnHand),
    principal: num((budget.debt as Doc).principal),
    liveFace: live.reduce((s, b) => s + b.totalIssued, 0),
    liveFloatFace: live.reduce((s, b) => s + b.publicFloat * b.faceValue, 0),
  };
}

describe("maturity wall on a fiscal-year boundary", () => {
  it("sits on a real boundary: the fiscal year turns over at the wall", () => {
    expect(isFiscalYearEnd(BOUNDARY_TURN)).toBe(true);
    expect(calculateFiscalYear(2030, BOUNDARY_TURN)).toBe(
      calculateFiscalYear(2030, BOUNDARY_TURN - 1) + 1
    );
  });

  it("refinances face for face, conserves cash, and a replay moves nothing", async () => {
    const { memory, holderId, bonds } = seedWall();
    const before = totals(memory);
    const cashBefore = before.treasury + before.pool + before.holder;

    for (const bond of bonds) {
      const live = memory
        .collection("bonds")
        .docs.find((row) => String((row as Doc)._id) === String(bond._id)) as unknown as Bond;
      const result = await settleFundedSovereignBondMaturity(memory as unknown as Db, {
        bond: live,
        turn: BOUNDARY_TURN,
        dueTurn: BOUNDARY_TURN,
        currencyCode: "USD",
        treasuryLocalPerAnchor: 1,
        nonBankRepaymentLocal: FACE,
        holderLegs: [
          {
            collection: "characters",
            filter: { _id: holderId },
            path: "cashOnHand",
            amount: 4_000,
            currencyCode: "USD",
            localPerAnchor: 1,
            note: "Pay the character holder",
          },
          {
            collection: "bondMarketPools",
            filter: { _id: "USD" },
            path: "cashLocal",
            amount: 6_000,
            currencyCode: "USD",
            localPerAnchor: 1,
            note: "Pay the pool float",
          },
        ],
        now: NOW,
        consolidateRollover: true,
      });
      expect(result?.status).toBe("applied");
    }

    const after = totals(memory);
    // The debt does not move: each maturing bond is replaced face for face.
    expect(after.principal).toBe(before.principal);
    expect(after.liveFace).toBe(COUNT * FACE);
    // The holder is paid in full and nothing is created or lost across the books.
    expect(after.holder - before.holder).toBe(COUNT * 4_000);
    expect(after.treasury + after.pool + after.holder).toBeCloseTo(cashBefore, 6);
    // Every old bond is closed.
    const old = (memory.collection("bonds").docs as unknown as Bond[]).filter((b) =>
      bonds.some((orig) => String(orig._id) === String(b._id))
    );
    expect(old.every((b) => b.matured === true)).toBe(true);

    const replayBonds = memory.collection("bonds").docs.length;
    for (const b of old) {
      await settleFundedSovereignBondMaturity(memory as unknown as Db, {
        bond: b,
        turn: BOUNDARY_TURN,
        dueTurn: BOUNDARY_TURN,
        currencyCode: "USD",
        treasuryLocalPerAnchor: 1,
        nonBankRepaymentLocal: FACE,
        holderLegs: [],
        now: NOW,
        consolidateRollover: true,
      });
    }
    expect(memory.collection("bonds").docs).toHaveLength(replayBonds);
    expect(totals(memory)).toEqual(after);
  });
});
