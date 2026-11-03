import { describe, expect, it } from "vitest";
import { BSON, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { economyResetPlanDigest } from "./digest";
import {
  joinPlanChunks,
  loadEconomyResetPlan,
  splitPlanJson,
  storeEconomyResetPlan,
  type EconomyResetPlanChunk,
} from "./planStore";
import { ECONOMY_RESET_PLANS_COLLECTION, type EconomyResetPlan } from "./types";

const BSON_LIMIT = 16 * 1024 * 1024;

/** A plan shaped like a real world's, padded past the BSON document limit. */
function bigPlan(): EconomyResetPlan {
  const openingBalances: Record<string, number> = {};
  for (let i = 0; i < 450_000; i++)
    openingBalances[`corporation:${i.toString(16).padStart(24, "0")}:USD`] = i * 1.25;
  return {
    version: 1,
    worldEpochId: "epoch",
    currentTurn: 1,
    ledgerTurn: 2,
    preset: "1991-default",
    approvalReference: "ref",
    commandEconomyEnabled: false,
    ledgerShadow: true,
    treasuryCashLedgerEnabled: false,
    wipe: [],
    reseed: [],
    partialWipe: [],
    characters: Array.from({ length: 20_000 }, (_, i) => ({
      id: i.toString(16).padStart(24, "0"),
      countryId: "PL",
      currency: "PLZ",
      personalLocal: i,
      cashOnHand: i,
    })),
    imperialCharacterIds: [],
    nppIdsWithMoney: [],
    sovereignBonds: [],
    corporateBondIds: [],
    couponClaims: [],
    maturityClaims: [],
    voidedMoneyMoves: [],
    legacyCouponClaims: [],
    centralBanks: [],
    publicBuyerSweeps: [],
    defenceReleases: [],
    pensionConversions: [],
    incomeTaxAssessmentsVoided: 0,
    money: {
      destroyedByKind: {},
      endowmentsByCurrency: {},
      corporateBondFaceByCurrency: {},
      maturityClaimsCancelledByCurrency: {},
      maturityEscrowSurplusByCurrency: {},
      voidedInFlightByCurrency: {},
      bankLoanCount: 0,
    },
    openingBalances,
    warnings: [],
    blockers: [],
  };
}

describe("economy reset plan store", () => {
  it("stores a plan above the BSON limit in chunks and reassembles it exactly", async () => {
    const plan = bigPlan();
    const digest = economyResetPlanDigest(plan);
    expect(Buffer.byteLength(JSON.stringify(plan))).toBeGreaterThan(BSON_LIMIT);
    const db = createInMemoryDb() as unknown as Db;
    const total = await storeEconomyResetPlan(db, digest, plan, new Date(0));
    expect(total).toBeGreaterThan(1);
    const chunks = await db
      .collection<EconomyResetPlanChunk>(ECONOMY_RESET_PLANS_COLLECTION)
      .find({ digest })
      .toArray();
    expect(chunks.length).toBe(total);
    for (const chunk of chunks)
      expect(BSON.calculateObjectSize(chunk)).toBeLessThan(BSON_LIMIT / 2);
    // A retried store writes the same chunk ids, never a second copy.
    expect(await storeEconomyResetPlan(db, digest, plan, new Date(1))).toBe(total);
    expect(await db.collection(ECONOMY_RESET_PLANS_COLLECTION).countDocuments({})).toBe(total);
    const loaded = await loadEconomyResetPlan(db, digest);
    expect(economyResetPlanDigest(loaded)).toBe(digest);
    expect(loaded).toEqual(plan);
  }, 60_000);

  it("refuses a missing chunk or a plan that does not match its digest", () => {
    const parts = splitPlanJson(JSON.stringify({ a: "x".repeat(10) }), 4);
    const chunks = parts.map((data, index) => ({ digest: "d", index, total: parts.length, data }));
    expect(() => joinPlanChunks("d", chunks.slice(1))).toThrow(/incomplete/);
    expect(() => joinPlanChunks("d", chunks)).toThrow(/does not match its digest/);
    expect(() => joinPlanChunks("d", [])).toThrow(/not stored/);
  });
});
