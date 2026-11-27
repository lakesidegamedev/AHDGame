import { beforeEach, describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { POST } from "@/app/api/admin/corporations/[id]/dividend/route";
import { getDb } from "@/lib/mongodb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: async () => ({ ok: true }) }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
const issuer = new ObjectId(),
  human = new ObjectId(),
  imperial = new ObjectId(),
  npp = new ObjectId(),
  holder = new ObjectId(),
  fund = new ObjectId();
function world() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10, worldEpochId: "dividend-test" }]);
  f.memory.seed("gameConfig", [{ _id: "default" }]);
  f.memory.seed("exchangeRates", [
    { _id: "CA", currencyCode: "CAD", rate: 1.4 },
    { _id: "DE", currencyCode: "EUR", rate: 0.8 },
    { _id: "US", currencyCode: "USD", rate: 1 },
  ]);
  f.memory.seed("corporations", [
    {
      _id: issuer,
      name: "Issuer",
      countryId: "CA",
      liquidCurrencyCode: "CAD",
      liquidCapital: 140,
      dividendRate: 10,
      totalShares: 100,
      publicFloat: 5,
      shareholders: [
        { characterId: human, shares: 20 },
        { imperialCharacterId: imperial, shares: 20 },
        { nppId: npp, shares: 20 },
        { corporationId: holder, shares: 20 },
        { fundId: fund, shares: 15 },
      ],
    },
    {
      _id: holder,
      name: "Corporate owner",
      countryId: "DE",
      liquidCurrencyCode: "EUR",
      liquidCapital: 0,
    },
  ]);
  f.memory.seed("characters", [
    { _id: human, name: "Human", countryId: "CA", currencyBalances: { personal: { CAD: 0 } } },
  ]);
  f.memory.seed("imperialCharacters", [
    {
      _id: imperial,
      name: "Imperial",
      countryId: "CA",
      currencyBalances: { personal: { CAD: 0 } },
    },
  ]);
  f.memory.seed("npps", [
    { _id: npp, countryId: "CA", currencyBalances: { personal: { CAD: 0 } } },
  ]);
  f.memory.seed("indexFunds", [
    {
      _id: fund,
      name: "Fund",
      slug: "fund",
      unitSupply: 100,
      cashAnchor: 0,
      anchorCurrencyCode: "USD",
    },
  ]);
  f.memory.seed("indexFundPositions", [
    { _id: new ObjectId(), fundId: fund, holderKind: "character", characterId: human, units: 100 },
  ]);
  return f;
}
const request = () =>
  new Request("https://example.com/admin/dividend", {
    method: "POST",
    headers: { "Idempotency-Key": "forced-request" },
  });
const call = () => POST(request(), { params: Promise.resolve({ id: issuer.toHexString() }) });
async function total(f: ReturnType<typeof world>) {
  const corp = await f.db.collection("corporations").find({}).toArray();
  const char = await f.db.collection("characters").findOne({ _id: human });
  const imp = await f.db.collection("imperialCharacters").findOne({ _id: imperial });
  const npc = await f.db.collection("npps").findOne({ _id: npp });
  const index = await f.db.collection("indexFunds").findOne({ _id: fund });
  const pool = await f.db.collection("equityMarketPools").findOne({ _id: "CAD" as never });
  return (
    Number(corp.find((row) => row._id.equals(issuer))?.liquidCapital) / 1.4 +
    Number(corp.find((row) => row._id.equals(holder))?.liquidCapital) / 0.8 +
    (Number(char?.currencyBalances.personal.CAD) +
      Number(imp?.currencyBalances.personal.CAD) +
      Number(npc?.currencyBalances.personal.CAD)) /
      1.4 +
    Number(char?.currencyBalances.personal.USD ?? 0) +
    Number(index?.cashAnchor) +
    Number(pool?.cashLocal ?? 0) / 1.4
  );
}
beforeEach(() => vi.clearAllMocks());
describe("forced dividend conservation", () => {
  it("pays all placed owner kinds in their units and replays overlapping requests once", async () => {
    const f = world();
    vi.mocked(getDb).mockResolvedValue(f.db);
    const replies = await Promise.all([call(), call()]);
    for (const reply of replies)
      expect(await reply.json()).toMatchObject({ success: true, paid: 14, recipients: 6 });
    expect((await f.db.collection("corporations").findOne({ _id: issuer }))?.liquidCapital).toBe(
      126
    );
    expect(
      (await f.db.collection("corporations").findOne({ _id: holder }))?.liquidCapital
    ).toBeCloseTo(1.6);
    expect(
      (await f.db.collection("npps").findOne({ _id: npp }))?.currencyBalances.personal.CAD
    ).toBeCloseTo(2.8);
    expect(await total(f)).toBeCloseTo(100, 8);
    expect(
      (await f.db.collection("characters").findOne({ _id: human }))?.currencyBalances.personal.CAD
    ).toBeCloseTo(2.8);
    expect((await call()).ok).toBe(true);
    expect(await total(f)).toBeCloseTo(100, 8);
  });
  it.each(["corporations", "characters", "indexFundTransactions", "financialTxLog"])(
    "rolls back a landed %s write before retry",
    async (collection) => {
      const f = world(),
        fault = withInjectedCrash(f.memory, {
          collection,
          op:
            collection === "corporations"
              ? "updateOne"
              : collection === "characters"
                ? "bulkWrite"
                : collection === "indexFundTransactions"
                  ? "insertOne"
                  : "insertMany",
          onCall: 1,
          afterWrite: true,
        });
      vi.mocked(getDb).mockResolvedValue(fault.db);
      expect((await call()).ok).toBe(false);
      expect(fault.crashed).toBe(true);
      expect((await f.db.collection("corporations").findOne({ _id: issuer }))?.liquidCapital).toBe(
        140
      );
      expect(await total(f)).toBeCloseTo(100, 8);
      fault.disarm();
      vi.mocked(getDb).mockResolvedValue(f.db);
      expect((await call()).ok).toBe(true);
      expect(await total(f)).toBeCloseTo(100, 8);
    }
  );
});
