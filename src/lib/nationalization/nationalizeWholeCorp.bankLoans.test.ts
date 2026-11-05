/**
 * Whole-corporation taking of a company that owes ordinary bank loans: the
 * primary National Corporation becomes the borrower before the company is
 * dissolved, the shareholders are compensated net of that debt, and a taking
 * the National Corporation cannot service is refused before any money moves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { BankLoan } from "@/lib/db/types/bank";
import {
  attachSecuredConstructionClaim,
  SECURED_PRINCIPAL,
} from "@/lib/test-utils/securedConstructionFixture";

const MARKET_CAP = 10_000_000;
const ORDINARY_PRINCIPAL = 40_000;
const natCorp = { _id: new ObjectId(), name: "National Co", countryId: "US", liquidCapital: 0 };

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("./compensation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./compensation")>()),
  // Identity tier: the payout is the net valuation itself.
  applyTier: (valuation: number) => valuation,
}));
vi.mock("@/lib/bonds/corporateBondDefault", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bonds/corporateBondDefault")>()),
  computeSectorNpvSum: () => 0,
}));
vi.mock("./nationalCorporation", () => ({
  ensurePrimaryNationalCorporation: vi.fn(async () => natCorp),
  resolveNationalCorporationForSector: vi.fn(async () => natCorp),
}));
vi.mock("./treasury", () => ({
  debitTreasuryCompensation: vi.fn().mockResolvedValue(0),
  creditTreasuryProceedsFromAnchor: vi.fn().mockResolvedValue(undefined),
  settleFundedTreasuryCompensation: vi.fn(),
}));
vi.mock("./treasuryLedger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./treasuryLedger")>()),
  loadTreasuryCashContext: vi.fn().mockResolvedValue(undefined),
  resolveTreasuryCashOptions: vi.fn().mockResolvedValue(undefined),
  witnessTreasuryCash: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./consequences/apply", () => ({
  applyNationalizationConsequences: vi
    .fn()
    .mockResolvedValue({ confidenceBefore: 70, confidenceAfter: 68, legitimacyDelta: 0 }),
}));
vi.mock("./ledger", () => ({ recordNationalizationLedger: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./concentration", () => ({
  readStateOwnershipConcentration: vi.fn().mockResolvedValue(0),
  sociMultiplier: () => 1,
}));
vi.mock("./heldEquityTransfer", () => ({
  heldStakeValueAnchor: () => 0,
  transferOwnedSharesToNatCorp: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/corporations/cleanupShareMarketActivity", () => ({
  cleanupShareMarketActivityForCorporations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/financialTxLog/stampDeleted", () => ({
  stampSubjectDeleted: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./dissolvedCorporation", () => ({
  deleteDissolvedCorporation: vi.fn(async (db: Db, id: ObjectId) => {
    await db.collection("corporations").deleteOne({ _id: id });
  }),
}));
vi.mock("@/lib/corporations/brandFacilityLoss", () => ({
  applyBrandFacilityLoss: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ currentYear: 2020, currentTurn: 200 }),
}));
vi.mock("@/lib/market/featureFlag", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/market/featureFlag")>()),
  getMarketSystemModeForDb: vi.fn(async () => "capital"),
}));
vi.mock("@/lib/currency/gdpAnchorRate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/currency/gdpAnchorRate")>()),
  loadWorldEraUnitScale: vi.fn().mockResolvedValue(1),
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/currency/corporationCapital", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/currency/corporationCapital")>()),
  loadFxRatesByCurrency: vi.fn().mockResolvedValue(new Map()),
  getCorpFxRate: vi.fn().mockResolvedValue(1),
}));

import { nationalizeWholeCorp } from "./ownershipTransition";
import { debitTreasuryCompensation } from "./treasury";
import { deleteDissolvedCorporation } from "./dissolvedCorporation";
import { servicePlayerLoan } from "@/lib/banking/namedLoanBook";

async function world(options: { ordinaryLoan?: Partial<BankLoan> | null } = {}) {
  const memory = createInMemoryDb();
  const targetId = new ObjectId(),
    sectorId = new ObjectId();
  memory.seed("corporations", [
    {
      _id: targetId,
      name: "Target Co",
      countryId: "US",
      liquidCapital: 0,
      sharePrice: MARKET_CAP / 1_000,
      totalShares: 1_000,
      shareholders: [],
    },
    { ...natCorp, liquidCapital: 1_000_000 },
  ]);
  memory.seed("corporateSectors", [
    {
      _id: sectorId,
      corporationId: targetId,
      countryId: "US",
      stateId: "US-VT",
      sectorType: "agriculture",
      revenue: 100,
      workers: 10,
    },
  ]);
  memory.seed("centralBanks", []);
  memory.seed("bonds", []);
  const secured = await attachSecuredConstructionClaim(memory, {
    sectorId,
    borrowerId: targetId,
  });
  const ordinaryLoanId = new ObjectId();
  if (options.ordinaryLoan !== null)
    memory.seed("bankLoans", [
      {
        _id: ordinaryLoanId,
        bankCorporationId: secured.bankId,
        charteredTurn: 2,
        currency: "USD",
        borrowerType: "corporation",
        borrowerId: targetId,
        principal: ORDINARY_PRINCIPAL,
        outstanding: ORDINARY_PRINCIPAL,
        ratePercent: 6,
        originatedTurn: 150,
        termTurns: 40,
        status: "current",
        ...options.ordinaryLoan,
      },
    ]);
  return { db: memory as unknown as Db, targetId, ordinaryLoanId, ...secured };
}

const take = (db: Db, corporationId: ObjectId) =>
  nationalizeWholeCorp(db, {
    countryId: "US" as never,
    corporationId,
    tier: "fair" as never,
    consequence: { method: "legislation", triggers: [], turn: 200 } as never,
  });

const loanOf = async (db: Db, id: ObjectId) =>
  (await db.collection<BankLoan>("bankLoans").findOne({ _id: id }))!;
const natCorpCash = async (db: Db) =>
  (await db.collection("corporations").findOne({ _id: natCorp._id }))?.liquidCapital as number;

describe("whole-corporation taking of a company with ordinary bank loans", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves the loans to the National Corporation, which services them next turn", async () => {
    const w = await world();
    await take(w.db, w.targetId);
    expect(await w.db.collection("corporations").findOne({ _id: w.targetId })).toBeNull();
    const loan = await loanOf(w.db, w.ordinaryLoanId);
    expect(String(loan.borrowerId)).toBe(String(natCorp._id));
    expect(loan.outstanding).toBe(ORDINARY_PRINCIPAL);

    const before = await natCorpCash(w.db);
    const served = await servicePlayerLoan(w.db, 201, w.bankId, loan, "USD", "Lender");
    expect(served.paidLocal).toBeGreaterThan(0);
    expect(await natCorpCash(w.db)).toBeCloseTo(before - served.paidLocal);
  });

  it("compensates net of the ordinary principal, without counting the construction loan twice", async () => {
    const unlevered = await world({ ordinaryLoan: null });
    const without = await take(unlevered.db, unlevered.targetId);
    expect(without.shareholderPayoutAnchor).toBe(MARKET_CAP - SECURED_PRINCIPAL);

    const levered = await world();
    const withLoan = await take(levered.db, levered.targetId);
    expect(without.shareholderPayoutAnchor - withLoan.shareholderPayoutAnchor).toBe(
      ORDINARY_PRINCIPAL
    );
    expect(vi.mocked(debitTreasuryCompensation).mock.calls.at(-1)?.[2]).toBe(
      MARKET_CAP - SECURED_PRINCIPAL - ORDINARY_PRINCIPAL
    );
  });

  it("refuses before any money moves when an ordinary loan is in another currency", async () => {
    const w = await world({ ordinaryLoan: { currency: "EUR" } });
    await expect(take(w.db, w.targetId)).rejects.toThrow(/repaid in EUR/);
    expect(debitTreasuryCompensation).not.toHaveBeenCalled();
    expect(await w.db.collection("corporations").findOne({ _id: w.targetId })).not.toBeNull();
    expect(String((await loanOf(w.db, w.ordinaryLoanId)).borrowerId)).toBe(String(w.targetId));
    const secured = await loanOf(w.db, w.loanId);
    expect(String(secured.borrowerId)).toBe(String(w.targetId));
    expect(secured.constructionSettlementOwner).toBeUndefined();
  });

  it("refuses while a loan request is still waiting on the bank", async () => {
    const w = await world({ ordinaryLoan: { status: "pending" } });
    await expect(take(w.db, w.targetId)).rejects.toThrow(/waiting on the bank/);
    expect(debitTreasuryCompensation).not.toHaveBeenCalled();
  });

  it("hands the loans back when the company could not be dissolved", async () => {
    const w = await world();
    vi.mocked(deleteDissolvedCorporation).mockRejectedValueOnce(new Error("delete failed"));
    await expect(take(w.db, w.targetId)).rejects.toThrow(/delete failed/);
    expect(String((await loanOf(w.db, w.ordinaryLoanId)).borrowerId)).toBe(String(w.targetId));
  });
});
