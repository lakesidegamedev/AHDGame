vi.mock("@/lib/api/withAtomicEconomicCommand", () => ({
  withAtomicEconomicCommand: (db: unknown, work: (db: unknown) => unknown) => work(db),
}));
// Formula fixtures isolate transaction transport; atomic suites exercise rollback and races.
vi.mock("@/lib/db/sessionDb", async (original) => ({
  ...(await original<typeof import("@/lib/db/sessionDb")>()),
  withSessionDb: (db: unknown, work: (db: unknown) => unknown) => work(db),
}));
/**
 * Voluntary dissolve while bonds are outstanding and none has defaulted: the
 * CEO must confirm, bondholders are paid pro-rata up to face value from the
 * company's assets, shareholders share the rest, and every unit paid out is
 * cash the company had (nothing minted). The settlement math is left real;
 * side-effecting collaborators are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn(), getMongoClient: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/api/corporations/resolveQuery", () => ({
  resolveCorporation: vi.fn(),
  requireCeo: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({
  isForexEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/currency/characterFunds", () => ({
  buildPersonalBalanceInc: (amt: number) => ({ cashOnHand: amt }),
  getHomeCurrency: () => "USD",
}));
vi.mock("@/lib/centralBank/helpers", () => ({
  getBankId: () => "cb-US",
  buildPrimeRateByCountry: () => new Map(),
}));
vi.mock("@/lib/currency/govBudgetFields", () => ({ writeGovBudgetLocal: (v: number) => v }));
vi.mock("@/lib/corporations/cleanupShareMarketActivity", () => ({
  cleanupShareMarketActivityForCorporations: vi.fn().mockResolvedValue(undefined),
  cleanupShareMarketActivityForCorporationTargets: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn(), wireHeadlineCorpDissolved: () => "" }));
vi.mock("@/lib/corporations/releaseHeldSharesToFloat", () => ({
  releaseCorporationHeldSharesToFloat: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/corporations/distributeCrossEquityInKind", () => ({
  distributeCrossEquityInKind: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/corporations/nppPickup", () => ({
  disposeLeavingSectors: vi.fn().mockResolvedValue({ recipientIds: [] }),
}));
vi.mock("@/lib/corporations/securedConstructionProperty", () => ({
  reserveSectorsForRestore: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/indexFunds/fundHoldingWriteOff", () => ({
  writeOffFundHoldingsInDissolvedCorporation: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/corporations/exits/recordCorporationExit", () => ({
  recordCorporationExit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTxBulk: vi.fn().mockResolvedValue(undefined),
  loadTxThresholds: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/financialTxLog/stampDeleted", () => ({
  stampSubjectDeleted: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/turn/currentTurn", () => ({ getCurrentTurn: vi.fn().mockResolvedValue(251) }));
vi.mock("@/lib/bonds/dissolutionCash", () => ({
  retireDissolvedCorporationCash: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/corporations/settlementLock", () => ({
  withCorporationSettlementLock: vi.fn(
    (
      _db: unknown,
      _id: unknown,
      _field: unknown,
      _now: unknown,
      run: (db: unknown) => Promise<unknown>
    ) => run(_db)
  ),
}));

import { POST } from "./handlers";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { resolveCorporation } from "@/lib/api/corporations/resolveQuery";
import { emitTxBulk } from "@/lib/financialTxLog/emit";
import { retireDissolvedCorporationCash } from "@/lib/bonds/dissolutionCash";
import { recordCorporationExit } from "@/lib/corporations/exits/recordCorporationExit";
import type { FinancialTxLogEntry } from "@/lib/db/types/financialTxLog";

const CEO = new ObjectId();
const HOLDER_A = new ObjectId();
const HOLDER_B = new ObjectId();

function cursor(docs: unknown[]) {
  const c = {
    project: () => c,
    sort: () => c,
    limit: () => c,
    toArray: async () => docs,
  };
  return c;
}

function fixture(opts: { cash: number; defaulted?: boolean }) {
  const corp = {
    _id: new ObjectId(),
    name: "Synthetic Co",
    countryId: "US",
    liquidCurrencyCode: "USD",
    isPrivate: true,
    ceoId: CEO,
    foundedAtTurn: 0,
    liquidCapital: opts.cash,
    totalShares: 100,
    publicFloat: 0,
    shareholders: [{ characterId: CEO, shares: 100 }],
  };
  // 6 units of $1,000 face: A is owed 4,000 and B 2,000.
  const bond = {
    _id: new ObjectId(),
    corporationId: corp._id,
    issuerType: "corporation",
    matured: false,
    defaulted: opts.defaulted ?? false,
    totalIssued: 6_000,
    couponRate: 5,
    holders: [
      { characterId: HOLDER_A, units: 4 },
      { characterId: HOLDER_B, units: 2 },
    ],
    publicFloat: 0,
  };
  const characterBulk = vi.fn().mockResolvedValue({});
  const collections: Record<string, unknown> = {
    bankLoans: { findOne: async () => null },
    supplyAgreements: { findOne: async () => null },
    bonds: {
      find: (q: Record<string, unknown>) => cursor("holders.corporationId" in q ? [] : [bond]),
      updateOne: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    corporations: {
      findOne: async () => corp,
      find: () => cursor([]),
      updateOne: vi.fn().mockResolvedValue({}),
      bulkWrite: vi.fn().mockResolvedValue({}),
      deleteOne: vi.fn().mockResolvedValue({}),
    },
    corporateSectors: { find: () => cursor([]) },
    centralBanks: { find: () => cursor([]), updateOne: vi.fn().mockResolvedValue({}) },
    exchangeRates: { find: () => cursor([]) },
    bondHistory: { deleteMany: vi.fn().mockResolvedValue({}) },
    characters: {
      find: () =>
        cursor([
          { _id: CEO, name: "Synthetic CEO", countryId: "US" },
          { _id: HOLDER_A, name: "Holder A", countryId: "US" },
          { _id: HOLDER_B, name: "Holder B", countryId: "US" },
        ]),
      findOne: async () => ({ _id: CEO, name: "Synthetic CEO", countryId: "US" }),
      bulkWrite: characterBulk,
    },
    imperialCharacters: { find: () => cursor([]), bulkWrite: vi.fn().mockResolvedValue({}) },
    gameState: {
      findOne: vi.fn().mockResolvedValue({ _id: "current", currentYear: 2027, currentTurn: 251 }),
    },
    gameConfig: { findOne: vi.fn().mockResolvedValue(null) },
    indexFunds: { find: () => cursor([]), updateOne: vi.fn(), bulkWrite: vi.fn() },
    corporationVotes: { findOne: vi.fn().mockResolvedValue(null) },
  };
  const db = {
    collection: (name: string) => {
      const c = collections[name];
      if (!c) throw new Error(`unexpected collection in test: ${name}`);
      return c;
    },
  } as unknown as Db;
  return { db, corp, characterBulk };
}

async function dissolve(
  setup: ReturnType<typeof fixture>,
  body?: Record<string, unknown>
): Promise<Response> {
  vi.mocked(getDb).mockResolvedValue(setup.db);
  vi.mocked(requireBasicAuth).mockResolvedValue({ ok: true, user: { userId: "u" } } as never);
  vi.mocked(resolveCorporation).mockResolvedValue({
    ok: true,
    corporation: setup.corp,
  } as never);
  return POST(
    new Request("http://localhost/x", {
      method: "POST",
      ...(body
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    }),
    { params: Promise.resolve({ id: String(setup.corp._id) }) }
  );
}

/** Cash credited to each character by the settlement. */
function creditsByCharacter(bulk: ReturnType<typeof vi.fn>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [ops] of bulk.mock.calls as Array<
    [Array<{ updateOne: { filter: { _id: ObjectId }; update: { $inc: { cashOnHand: number } } } }>]
  >)
    for (const op of ops) {
      const id = op.updateOne.filter._id.toHexString();
      out.set(id, (out.get(id) ?? 0) + op.updateOne.update.$inc.cashOnHand);
    }
  return out;
}

function entries(): Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged">[] {
  return vi
    .mocked(emitTxBulk)
    .mock.calls.flatMap(
      (c) => c[1] as Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged">[]
    );
}

beforeEach(() => vi.clearAllMocks());

describe("voluntary dissolve with bonds outstanding", () => {
  it("is refused without the confirm and moves no money", async () => {
    const setup = fixture({ cash: 10_000 });
    const res = await dissolve(setup);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("BOND_SETTLEMENT_CONFIRM_REQUIRED");
    expect(body.requiresBondSettlementConfirm).toBe(true);
    expect(setup.characterBulk).not.toHaveBeenCalled();
    expect(retireDissolvedCorporationCash).not.toHaveBeenCalled();
  });

  it("pays bondholders in full first and the shareholders the remainder", async () => {
    const setup = fixture({ cash: 10_000 });
    const res = await dissolve(setup, { settleBonds: true });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.settledBonds).toBe(true);
    expect(body.bondRecoveryPool).toBe(6_000);
    expect(body.shareholderPool).toBe(4_000);
    expect(body.ceoPayout).toBe(4_000);

    const credits = creditsByCharacter(setup.characterBulk);
    expect(credits.get(HOLDER_A.toHexString())).toBe(4_000);
    expect(credits.get(HOLDER_B.toHexString())).toBe(2_000);
    expect(credits.get(CEO.toHexString())).toBe(4_000);

    // Nothing minted: everything paid out is the cash the company retires.
    const paid = [...credits.values()].reduce((s, v) => s + v, 0);
    expect(paid).toBe(10_000);
    expect(vi.mocked(retireDissolvedCorporationCash).mock.calls[0]![1]).toMatchObject({
      liquidCapital: 10_000,
      assetLiquidationCredit: 0,
    });

    // Every payout is booked on the ledger.
    const rows = entries();
    const bondRows = rows.filter((e) => e.type === "bond_dissolution_payout");
    const shareRows = rows.filter((e) => e.type === "corp_dissolution_distribution");
    expect(bondRows.reduce((s, e) => s + e.amount, 0)).toBe(6_000);
    expect(shareRows.reduce((s, e) => s + e.amount, 0)).toBe(4_000);
    expect(vi.mocked(recordCorporationExit).mock.calls[0]![2]).toMatchObject({
      reason: "voluntary_closure",
    });
  });

  it("splits a shortfall between bondholders pro-rata and leaves shareholders nothing", async () => {
    const setup = fixture({ cash: 3_000 });
    const res = await dissolve(setup, { settleBonds: true });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.bondRecoveryPool).toBe(3_000);
    expect(body.shareholderPool).toBe(0);
    const credits = creditsByCharacter(setup.characterBulk);
    expect(credits.get(HOLDER_A.toHexString())).toBe(2_000);
    expect(credits.get(HOLDER_B.toHexString())).toBe(1_000);
    expect(credits.get(CEO.toHexString()) ?? 0).toBe(0);
    expect([...credits.values()].reduce((s, v) => s + v, 0)).toBe(3_000);
  });

  it("still sends a company with a defaulted bond to the bond default screen", async () => {
    const setup = fixture({ cash: 10_000, defaulted: true });
    const res = await dissolve(setup, { settleBonds: true });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("defaulted bond");
    expect(setup.characterBulk).not.toHaveBeenCalled();
  });
});
