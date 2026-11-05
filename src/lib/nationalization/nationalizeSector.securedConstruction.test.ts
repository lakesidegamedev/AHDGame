/**
 * Single-sector taking of a site built with a secured construction loan: the
 * National Corporation takes the loan with the site, so the former owner is
 * compensated on the site's value net of the principal the state now repays.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { BankLoan } from "@/lib/db/types/bank";
import {
  attachSecuredConstructionClaim,
  SECURED_PRINCIPAL,
} from "@/lib/test-utils/securedConstructionFixture";

const VALUE = 1_000_000;
const natCorp = { _id: new ObjectId(), name: "National Co", countryId: "US", liquidCapital: 0 };

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("./compensation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./compensation")>()),
  sectorCompensationValuationAnchor: () => VALUE,
  // Identity tier: the payout is the net valuation itself.
  applyTier: (valuation: number) => valuation,
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

import { nationalizeSector } from "./ownershipTransition";

async function world(outstanding = SECURED_PRINCIPAL) {
  const memory = createInMemoryDb();
  const donorId = new ObjectId(),
    sectorId = new ObjectId();
  memory.seed("corporations", [
    { _id: donorId, name: "Donor Co", countryId: "US", liquidCapital: 0 },
    { ...natCorp },
  ]);
  memory.seed("corporateSectors", [
    {
      _id: sectorId,
      corporationId: donorId,
      countryId: "US",
      stateId: "US-VT",
      sectorType: "agriculture",
      revenue: 100,
      workers: 10,
    },
  ]);
  memory.seed("centralBanks", []);
  const secured = await attachSecuredConstructionClaim(memory, { sectorId, borrowerId: donorId });
  const db = memory as unknown as Db;
  await db.collection("bankLoans").updateOne({ _id: secured.loanId }, { $set: { outstanding } });
  return { db, donorId, sectorId, ...secured };
}

const take = (db: Db, sectorId: ObjectId) =>
  nationalizeSector(db, {
    countryId: "US" as never,
    sectorId,
    tier: "fair" as never,
    consequence: { method: "legislation", triggers: [], turn: 200 } as never,
  });

describe("nationalizing a site with a secured construction loan", () => {
  it("pays the former owner net of the principal the state takes on", async () => {
    const w = await world();
    const result = await take(w.db, w.sectorId);
    expect(result.compensationPaid).toBe(VALUE - SECURED_PRINCIPAL);
    const donor = await w.db.collection("corporations").findOne({ _id: w.donorId });
    expect(donor?.liquidCapital).toBe(VALUE - SECURED_PRINCIPAL);
    const loan = (await w.db.collection<BankLoan>("bankLoans").findOne({ _id: w.loanId }))!;
    expect(String(loan.borrowerId)).toBe(String(natCorp._id));
    expect(loan.outstanding).toBe(SECURED_PRINCIPAL);
  });

  it("pays nothing, never a negative amount, when the loan exceeds the site's value", async () => {
    const w = await world(VALUE * 3);
    const result = await take(w.db, w.sectorId);
    expect(result.compensationPaid).toBe(0);
    const donor = await w.db.collection("corporations").findOne({ _id: w.donorId });
    expect(donor?.liquidCapital).toBe(0);
  });
});
