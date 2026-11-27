import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { getDb } from "@/lib/mongodb";
import { POST } from "@/app/api/admin/corporations/[id]/imf-bailout/route";
import { seedImfInstitution } from "./seedImfInstitution";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({
  requireAdmin: async () => ({ ok: true, user: { userId: "admin" } }),
}));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/mail/systemMail", () => ({ sendSystemMail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/corporations/sentimentEvents", () => ({ fireImfBailoutPulse: vi.fn() }));
function world() {
  const f = createTransactionalMemoryDb(),
    issuer = new ObjectId(),
    imf = new ObjectId(),
    creditor = new ObjectId(),
    second = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 50, preset: "2019-default" }]);
  f.memory.seed("characters", [
    { _id: creditor, name: "Investor", userId: new ObjectId(), sequentialId: 1 },
    { _id: second, userId: new ObjectId() },
  ]);
  f.memory.seed("corporations", [
    {
      _id: issuer,
      name: "Issuer",
      countryId: "US",
      totalShares: 100,
      shareholders: [],
      publicFloat: 100,
      liquidCapital: 500,
    },
    {
      _id: imf,
      name: "IMF",
      imfInstitution: true,
      countryId: "US",
      liquidCurrencyCode: "USD",
      liquidCapital: 1000,
      shareholders: [{ characterId: creditor, shares: 60, avgCostPerShare: 7 }],
      totalShares: 100,
      publicFloat: 40,
    },
  ]);
  f.memory.seed("bonds", [
    {
      _id: new ObjectId(),
      corporationId: issuer,
      issuerName: "Issuer",
      matured: false,
      totalIssued: 100_000,
      publicFloat: 40,
      holders: [{ characterId: creditor, units: 60, avgCostPerUnit: 1000 }],
      currencyCode: "USD",
      couponRate: 5,
    },
  ]);
  const call = () =>
    POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: true,
          targetOwnershipPercent: 40,
          annualRatePercent: 6,
          amortizationTurns: 240,
          bondHaircutRetention: 0.7,
        }),
      }),
      { params: Promise.resolve({ id: String(issuer) }) }
    );
  return { ...f, issuer, imf, creditor, second, call };
}
describe("IMF creditor preservation", () => {
  it("rolls back interrupted novation, then concurrent activation retains every proportional claim", async () => {
    const f = world(),
      fault = withInjectedCrash(f.memory, {
        collection: "bonds",
        op: "bulkWrite",
        onCall: 1,
        afterWrite: true,
      });
    vi.mocked(getDb).mockResolvedValue(fault.db);
    expect((await f.call()).ok).toBe(false);
    expect(f.memory.collection("bonds").docs[0]).toMatchObject({
      corporationId: f.issuer,
      totalIssued: 100_000,
      holders: [{ units: 60 }],
    });
    vi.mocked(getDb).mockResolvedValue(f.db);
    const responses = await Promise.all([f.call(), f.call()]);
    expect(responses.filter((r) => r.ok)).toHaveLength(1);
    expect(f.memory.collection("bonds").docs).toHaveLength(1);
    expect(f.memory.collection("bonds").docs[0]).toMatchObject({
      corporationId: f.imf,
      totalIssued: 70_000,
      publicFloat: 28,
      holders: [{ characterId: f.creditor, units: 42 }],
    });
    expect(
      f.memory.collection("corporations").docs.find((c) => String(c._id) === String(f.issuer))
    ).toMatchObject({ liquidCapital: 500, imfFacilityPrincipalOutstanding: 70_000 });
    expect(
      f.memory.collection("corporations").docs.find((c) => String(c._id) === String(f.imf))
    ).toMatchObject({ liquidCapital: 1000 });
  });
  it("setup cannot overwrite investor ownership or market float", async () => {
    const f = world();
    await expect(
      seedImfInstitution(f.db, {
        ceoCharacterId: f.creditor,
        shareholderCharacterIds: [f.creditor, f.second],
        repairExisting: true,
      })
    ).rejects.toThrow(/cannot replace investor holdings/);
    expect(
      f.memory.collection("corporations").docs.find((c) => String(c._id) === String(f.imf))
    ).toMatchObject({
      totalShares: 100,
      publicFloat: 40,
      shareholders: [{ characterId: f.creditor, shares: 60, avgCostPerShare: 7 }],
    });
  });
});
