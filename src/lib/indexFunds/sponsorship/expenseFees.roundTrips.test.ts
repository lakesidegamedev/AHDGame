/**
 * Round-trip budget for the sponsored-fund expense fee pass.
 *
 * Every fee row used to pay its own transaction-threshold and turn-cadence
 * reads through `emitTx`, so the pass cost grew with five round trips per
 * sponsored fund on top of the writes it genuinely needs. The pass now loads
 * both once. This test pins the row count, pins the money, and counts the
 * round trips the old shape would have cost against the new one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type ClientSession, type Db } from "mongodb";
import type { IndexFund } from "@/lib/db/types";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import { chargeSponsorExpenseFees } from "./expenseFees";
import { expenseFeeForTurn } from "./constants";
import { emitTx, loadTxThresholds } from "@/lib/financialTxLog/emit";

vi.mock("@/lib/mongodb", () => ({
  getMongoClient: vi.fn(),
  getDb: vi.fn(async () => {
    throw new Error("no ambient database in this test");
  }),
}));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));

const NOW = new Date("2000-01-01T00:00:00Z");

function feeWorld(fundCount: number): { memory: InMemoryDb; db: Db; sponsorId: ObjectId } {
  const memory = createInMemoryDb();
  const session = { endSession: vi.fn(async () => {}) } as unknown as ClientSession;
  session.withTransaction = (async (work: (session: ClientSession) => Promise<unknown>) =>
    work(session)) as ClientSession["withTransaction"];
  const db = Object.assign(memory, { client: { startSession: () => session } }) as unknown as Db;
  const sponsorId = new ObjectId();
  memory.seed("corporations", [
    {
      _id: sponsorId,
      name: "Sponsor Bank",
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 50_000_000,
      createdAt: NOW,
      updatedAt: NOW,
    } as unknown as Record<string, unknown>,
  ]);
  memory.seed(
    "indexFunds",
    Array.from({ length: fundCount }, (_, index) => ({
      _id: new ObjectId(),
      slug: `sponsored-${index}`,
      name: `Sponsored ${index}`,
      tickerSymbol: `SP${index}`,
      scope: "country",
      countryId: "US",
      kind: "broad",
      anchorCurrencyCode: "USD",
      status: "active",
      cashAnchor: 25_000,
      unitSupply: 1_000,
      reserveUnits: 0,
      quotedNav: 100,
      backingRatio: 1,
      holdings: [{ corporationId: new ObjectId(), shares: 750, lastValueAnchor: 75_000 }],
      targetConstituents: [],
      sponsorCorporationId: sponsorId,
      expenseRatioAnnual: 0.01,
      createdAt: NOW,
      updatedAt: NOW,
    })) as unknown as Record<string, unknown>[]
  );
  memory.seed("exchangeRates", [{ currencyCode: "USD", rate: 1 }]);
  memory.seed("gameConfig", [
    { _id: "default", playerFundSponsorshipEnabled: true, indexFundsMode: "full" },
  ]);
  memory.seed("systemSettings", [{ _id: "current", financialTxLog: { thresholds: {} } }]);
  return { memory, db, sponsorId };
}

/** The row shape the fee loop emits, as the old per-row emitter received it. */
function witnessRows(memory: InMemoryDb, sponsorId: ObjectId): Parameters<typeof emitTx>[1][] {
  return memory.collection("indexFunds").docs.map((fund) => ({
    type: "corp_revenue" as const,
    turn: 11,
    createdAt: NOW,
    subjectType: "corporation" as const,
    subjectId: sponsorId,
    subjectName: "Sponsor Bank",
    amount: 200,
    anchorAmount: 200,
    currencyCode: "USD" as const,
    counterpartyType: "system" as const,
    counterpartyName: String(fund.name),
    meta: { kind: "fund_expense_fee", fundId: String(fund._id) },
  }));
}

describe("expense fee pass round trips", () => {
  beforeEach(() => vi.clearAllMocks());

  it("charges every sponsored fund with one receipt and one journal row each", async () => {
    const { memory, db } = feeWorld(6);
    const funds = memory.collection("indexFunds").docs as unknown as IndexFund[];
    const before = funds.reduce((sum, fund) => sum + fund.cashAnchor, 0);

    const result = await chargeSponsorExpenseFees(db, funds, 11);

    expect(result.fundsCharged).toBe(6);
    expect(result.totalFeeAnchor).toBeGreaterThan(0);
    expect(memory.collection("indexFundTransactions").docs).toHaveLength(6);
    expect(memory.collection("financialTxLog").docs).toHaveLength(6);
    const after = (memory.collection("indexFunds").docs as unknown as IndexFund[]).reduce(
      (sum, fund) => sum + fund.cashAnchor,
      0
    );
    expect(before - after).toBeCloseTo(result.totalFeeAnchor, 6);
    // One fee per fund: cash 25,000 plus 75,000 of holdings is 100,000 of
    // marked backing at the annual ratio.
    const expectedFee = expenseFeeForTurn(100_000, 0.01);
    for (const row of memory.collection("financialTxLog").docs)
      expect(row.anchorAmount).toBeCloseTo(expectedFee, 6);
  });

  it("counts fewer round trips than the per-row emission it replaced", async () => {
    const fundCount = 12;

    const current = feeWorld(fundCount);
    const currentTrips = countRoundTrips(current.memory);
    await chargeSponsorExpenseFees(
      current.db,
      current.memory.collection("indexFunds").docs as unknown as IndexFund[],
      11
    );

    // The old shape: no preloaded thresholds or cadence for any row, so every
    // witness paid both config reads again before its insert.
    const old = feeWorld(fundCount);
    const oldTrips = countRoundTrips(old.memory);
    for (const row of witnessRows(old.memory, old.sponsorId)) {
      await loadTxThresholds(old.db);
      await emitTx(old.db, row);
    }

    expect(currentTrips.count("financialTxLog", "insertOne")).toBe(fundCount);
    expect(currentTrips.total(), currentTrips.summary()).toBeLessThan(oldTrips.total() / 2);
    expect(currentTrips.count("systemSettings", "findOne")).toBeLessThanOrEqual(1);
  });
});
