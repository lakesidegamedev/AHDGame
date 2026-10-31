import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import {
  buildAcquisitionWorld,
  readBalances,
  ACQUIRER_CASH,
  SHELL_CASH,
} from "./acquisitionSettlementWorld";
import { referenceValuation } from "./referenceValuation";
import { executeAgreedAcquisition } from "./executeAgreedAcquisition";
import { controllerTransferBarrierError } from "./controllerTransferBarrier";
import type { Corporation } from "@/lib/db/types";

vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/currency/corporationCapital", async (original) => ({
  ...(await original<typeof import("@/lib/currency/corporationCapital")>()),
  loadFxRatesByCurrency: vi.fn().mockResolvedValue(
    new Map([
      ["USD", 1],
      ["GBP", 2],
      ["JPY", 100],
    ])
  ),
  getCorpFxRate: vi.fn(async (_db, c) =>
    c.liquidCurrencyCode === "GBP" ? 2 : c.liquidCurrencyCode === "JPY" ? 100 : 1
  ),
}));
vi.mock("@/lib/gameState", () => ({
  getGameState: vi.fn().mockResolvedValue({ currentTurn: 200, currentYear: 2000 }),
}));
vi.mock("@/lib/currency/gdpAnchorRate", () => ({
  loadWorldEraUnitScale: vi.fn().mockResolvedValue(1),
}));
vi.mock("@/lib/market/featureFlag", () => ({
  getMarketSystemModeForDb: vi.fn().mockResolvedValue("baseline"),
  marketAtLeast: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/bonds/sectorExitBasis", () => ({
  sectorExitValueAnchor: vi.fn().mockReturnValue(0),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn() }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/corporations/mergerReview/gate", () => ({
  assertMergerClearance: vi.fn().mockResolvedValue({ ok: true }),
  acquisitionsBarredByDivestiture: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/corporations/mergerReview/lifecycle", () => ({ attachMergerRemedy: vi.fn() }));

async function target(w: ReturnType<typeof buildAcquisitionWorld>) {
  return (await w.db.collection<Corporation>("corporations").findOne({ _id: w.tgt }))!;
}

describe("acquisition safeguards with live balance-sheet rules", () => {
  it.each([undefined, "subsidiary"] as const)(
    "rejects a cheap %s acquisition without moving money",
    async (outcome) => {
      const w = buildAcquisitionWorld();
      const result = await executeAgreedAcquisition({
        db: w.db,
        offer: { ...w.offer, ...(outcome ? { outcome } : {}) },
        currentTurn: 200,
      });
      expect(result).toMatchObject({ ok: false, status: 400 });
      const balances = await readBalances(w);
      expect(balances.acquirer).toBe(ACQUIRER_CASH);
      expect((await target(w)).liquidCapital).toBe(SHELL_CASH);
      expect(await w.db.collection("acquisitionSettlements").countDocuments({})).toBe(0);
    }
  );
  it("includes held bonds so replacing cash with securities cannot lower the floor", async () => {
    const w = buildAcquisitionWorld({ shellCash: 0 });
    w.memory.seed("bonds", [
      {
        _id: new ObjectId(),
        countryId: "US",
        currencyCode: "USD",
        matured: false,
        marketPrice: 1,
        holders: [{ corporationId: w.tgt, units: 2000 }],
      },
    ]);
    const value = await referenceValuation(w.db, await target(w));
    expect(value.minimumPriceAnchor).toBeGreaterThan(0);
    expect(value.minimumPriceAnchor).toBe(value.portfolioAnchor);
  });
  it.each([
    ["US", "USD", 1],
    ["UK", "GBP", 2],
    ["JP", "JPY", 100],
  ] as const)(
    "normalizes %s cash to anchor before pricing",
    async (countryId, liquidCurrencyCode, rate) => {
      const w = buildAcquisitionWorld({ shellCash: 20_000_000 * rate });
      await w.db
        .collection("corporations")
        .updateOne({ _id: w.tgt }, { $set: { countryId, liquidCurrencyCode } });
      expect((await referenceValuation(w.db, await target(w))).minimumPriceAnchor).toBe(20_000_000);
    }
  );
  it("blocks corporate ownership transfers for 47 turns and permits them at 48", async () => {
    const w = buildAcquisitionWorld();
    const ceoId = new ObjectId();
    w.memory.seed("characters", [{ _id: ceoId, createdTurn: 100 }]);
    const corp = { ...(await target(w)), ceoId, ceoType: "character" as const };
    expect(await controllerTransferBarrierError(w.db, corp, 147, new Date())).toMatch(/1 turn/);
    expect(await controllerTransferBarrierError(w.db, corp, 148, new Date())).toBeNull();
  });
});

it("returns a fair acquisition's float payout to its funding pool exactly once", async () => {
  const w = buildAcquisitionWorld({ price: SHELL_CASH });
  const original = await target(w);
  w.memory.seed("equityMarketPools", [
    { _id: "USD", cashLocal: 1000, lifetime: { purchasesIn: 0 } },
  ]);
  const before = await readBalances(w);
  const result = await executeAgreedAcquisition({ db: w.db, offer: w.offer, currentTurn: 200 });
  expect(result.ok).toBe(true);
  if (original.publicFloat == null || original.publicFloat <= 0) {
    throw new Error("The acquisition fixture must include a positive public float.");
  }
  const expected = Math.floor((w.price * original.publicFloat) / original.totalShares);
  const pool = await w.db.collection("equityMarketPools").findOne({ _id: "USD" as never });
  expect(pool?.cashLocal).toBe(1000 + expected);
  expect(pool?.lifetime.purchasesIn).toBe(expected);
  expect((await readBalances(w)).treasury).toBe(before.treasury);
  expect((await executeAgreedAcquisition({ db: w.db, offer: w.offer, currentTurn: 200 })).ok).toBe(
    true
  );
  expect(
    (await w.db.collection("equityMarketPools").findOne({ _id: "USD" as never }))?.cashLocal
  ).toBe(1000 + expected);
});

it("nets issued debt against the assets of a subsidiary target", async () => {
  const w = buildAcquisitionWorld();
  w.memory.seed("bonds", [
    {
      _id: new ObjectId(),
      corporationId: w.tgt,
      currencyCode: "USD",
      matured: false,
      totalIssued: 4_000_000,
      marketPrice: 1,
      holders: [],
    },
  ]);
  expect((await referenceValuation(w.db, await target(w))).minimumPriceAnchor).toBe(1_000_000);
});
it("does not let an NPP caretaker bypass the owner's new-character restriction", async () => {
  const w = buildAcquisitionWorld();
  const userId = new ObjectId();
  w.memory.seed("characters", [{ _id: new ObjectId(), userId, createdTurn: 100 }]);
  const corp = {
    ...(await target(w)),
    ceoId: new ObjectId(),
    ceoType: "npp" as const,
    caretakerCeo: {} as never,
    userId,
  };
  expect(await controllerTransferBarrierError(w.db, corp, 147, new Date())).toMatch(/1 turn/);
});

it("moves collected share escrow with the shell's cash", async () => {
  const w = buildAcquisitionWorld({ price: 7_000_000 });
  await w.db
    .collection("corporations")
    .updateOne({ _id: w.tgt }, { $set: { shareEscrowBalance: 2_000_000 } });
  const result = await executeAgreedAcquisition({ db: w.db, offer: w.offer, currentTurn: 200 });
  expect(result.ok).toBe(true);
  expect((await readBalances(w)).acquirer).toBe(ACQUIRER_CASH);
});
it("refuses to erase a facility liability by deleting its corporate shell", async () => {
  const w = buildAcquisitionWorld();
  await w.db
    .collection("corporations")
    .updateOne({ _id: w.tgt }, { $set: { imfFacilityPrincipalOutstanding: 4_000_000 } });
  const result = await executeAgreedAcquisition({ db: w.db, offer: w.offer, currentTurn: 200 });
  expect(result).toMatchObject({ ok: false, status: 400 });
  expect((await readBalances(w)).acquirer).toBe(ACQUIRER_CASH);
  expect((await target(w)).imfFacilityPrincipalOutstanding).toBe(4_000_000);
});
