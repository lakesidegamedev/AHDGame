import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { assertTransactionSupportAtBoot } from "@/lib/db/transactionSupport";
import {
  applyNppRedemptionsSequentially,
  processNppFundRedemptions,
  writeNppRedemptionBatch,
  type PlannedNppRedemption,
} from "./nppRedemption";

vi.mock("@/lib/db/transactionSupport", () => ({
  assertTransactionSupportAtBoot: vi.fn(async () => true),
}));

const NOW = new Date("2026-10-30T00:00:00Z");
const FUND_A = new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
const FUND_B = new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");
const NPP_1 = new ObjectId("111111111111111111111111");
const NPP_2 = new ObjectId("222222222222222222222222");
const NPP_3 = new ObjectId("333333333333333333333333");

function seedWorld(): InMemoryDb {
  const db = createInMemoryDb();
  db.seed("indexFunds", [
    { _id: FUND_A, unitSupply: 1000.5, quotedNav: 12.25 },
    { _id: FUND_B, unitSupply: 400, quotedNav: 3.5 },
  ]);
  db.seed("indexFundPositions", [
    // Partly legacy, partly not.
    {
      _id: new ObjectId(),
      fundId: FUND_A,
      holderKind: "npp",
      nppId: NPP_1,
      units: 50,
      legacyUnits: 3,
    },
    // No legacyUnits field: the debit treats the whole position as legacy.
    { _id: new ObjectId(), fundId: FUND_B, holderKind: "npp", nppId: NPP_1, units: 20 },
    // Redeemed to exactly zero: the position document is removed.
    { _id: new ObjectId(), fundId: FUND_A, holderKind: "npp", nppId: NPP_2, units: 7 },
    { _id: new ObjectId(), fundId: FUND_B, holderKind: "npp", nppId: NPP_3, units: 90 },
    // A player position on the same fund is never touched.
    { _id: new ObjectId(), fundId: FUND_A, holderKind: "character", characterId: NPP_3, units: 9 },
  ]);
  return db;
}

const PLANNED: PlannedNppRedemption[] = [
  { nppId: NPP_1, intent: { fundId: FUND_A, units: 5 }, quotedNav: 12.25 },
  { nppId: NPP_1, intent: { fundId: FUND_B, units: 2 }, quotedNav: 3.5 },
  { nppId: NPP_2, intent: { fundId: FUND_A, units: 7 }, quotedNav: 12.25 },
  { nppId: NPP_3, intent: { fundId: FUND_B, units: 9 }, quotedNav: 3.5 },
];

/** Everything the redemption pass writes, minus generated ids. */
function writeSet(db: InMemoryDb) {
  const strip = ({ _id: _ignored, ...rest }: Record<string, unknown>) => rest;
  const byKey = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b));
  return {
    funds: db.collection("indexFunds").docs.map(strip).sort(byKey),
    positions: db.collection("indexFundPositions").docs.map(strip).sort(byKey),
    queue: db.collection("indexFundRedemptionQueue").docs.map(strip).sort(byKey),
    transactions: db.collection("indexFundTransactions").docs.map(strip).sort(byKey),
  };
}

describe("NPP redemption batch", () => {
  // debitFundPosition stamps positions with the clock; pin it so both paths agree.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("writes exactly what the per-intent path writes", async () => {
    const sequentialDb = seedWorld();
    const sequential = await applyNppRedemptionsSequentially(
      sequentialDb as unknown as Db,
      PLANNED,
      NOW
    );
    expect(sequential).toEqual({ redemptionsQueued: 4, unitsRedeemed: 23, errors: [] });

    const batchDb = seedWorld();
    await writeNppRedemptionBatch(batchDb as unknown as Db, PLANNED, NOW);

    expect(writeSet(batchDb)).toEqual(writeSet(sequentialDb));
    // Spot-check the semantics both paths share.
    const positions = batchDb.collection("indexFundPositions").docs;
    expect(positions.find((p) => String(p.nppId) === String(NPP_2))).toBeUndefined();
    expect(
      positions.find(
        (p) => String(p.nppId) === String(NPP_1) && String(p.fundId) === String(FUND_A)
      )
    ).toMatchObject({ units: 45, legacyUnits: 0 });
    expect(
      positions.find(
        (p) => String(p.nppId) === String(NPP_1) && String(p.fundId) === String(FUND_B)
      )
    ).toMatchObject({ units: 18, legacyUnits: 18 });
    expect(batchDb.collection("indexFunds").docs.map((f) => f.unitSupply)).toEqual([988.5, 389]);
  });

  it("issues one command per collection instead of four per intent", async () => {
    const db = seedWorld();
    const calls: string[] = [];
    const tracked = {
      collection(name: string) {
        const col = db.collection(name);
        return new Proxy(col, {
          get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
              calls.push(`${String(prop)}:${name}`);
              return value.apply(target, args);
            };
          },
        });
      },
    };
    await writeNppRedemptionBatch(tracked as unknown as Db, PLANNED, NOW);
    expect(calls).toEqual([
      "bulkWrite:indexFundPositions",
      "bulkWrite:indexFundPositions",
      "bulkWrite:indexFunds",
      "insertMany:indexFundRedemptionQueue",
      "insertMany:indexFundTransactions",
    ]);
  });

  it("refuses the batch when a position debit would be skipped", async () => {
    const db = seedWorld();
    const tooMuch: PlannedNppRedemption[] = [
      ...PLANNED,
      { nppId: NPP_2, intent: { fundId: FUND_A, units: 1 }, quotedNav: 12.25 },
    ];
    await expect(writeNppRedemptionBatch(db as unknown as Db, tooMuch, NOW)).rejects.toThrow();
    // Inside the caller's transaction this aborts; nothing past the debit ran.
    expect(db.collection("indexFundRedemptionQueue").docs).toHaveLength(0);
  });

  it("refuses the batch when a supply burn would be skipped", async () => {
    const db = seedWorld();
    db.collection("indexFunds").docs[1].unitSupply = 10;
    await expect(writeNppRedemptionBatch(db as unknown as Db, PLANNED, NOW)).rejects.toThrow();
    expect(db.collection("indexFundRedemptionQueue").docs).toHaveLength(0);
  });

  describe("pass routing", () => {
    function worldWithClient(withTransaction: (fn: () => Promise<void>) => Promise<void>) {
      const db = seedWorld();
      db.seed("gameConfig", [{ _id: "default", nppFundRedemptionEnabled: true }]);
      db.seed("npps", [{ _id: NPP_3, nppInvestmentCashAnchor: 0 }]);
      const session = {
        withTransaction: vi.fn(withTransaction),
        endSession: vi.fn(async () => {}),
      };
      Object.assign(db, { client: { startSession: () => session } });
      return { db, session };
    }
    const options = {
      currentTurn: 8,
      activeFunds: [{ _id: FUND_B, quotedNav: 3.5, unitSupply: 400 }] as unknown as Parameters<
        typeof processNppFundRedemptions
      >[1]["activeFunds"],
      archetypesByNppId: new Map([[NPP_3.toString(), "conservative" as const]]),
    };

    it("applies every intent in one transaction when the topology supports it", async () => {
      const { db, session } = worldWithClient((fn) => fn());
      const result = await processNppFundRedemptions(db as unknown as Db, options);
      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(session.endSession).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ redemptionsQueued: 1, unitsRedeemed: 9, errors: [] });
      expect(db.collection("indexFundRedemptionQueue").docs).toHaveLength(1);
    });

    it("does not re-run intents after a failed commit", async () => {
      const { db } = worldWithClient(async () => {
        throw new Error("commit unknown");
      });
      const result = await processNppFundRedemptions(db as unknown as Db, options);
      expect(result.redemptionsQueued).toBe(0);
      expect(result.errors).toEqual(["NPP redemptions batch: commit unknown"]);
      expect(db.collection("indexFundRedemptionQueue").docs).toHaveLength(0);
    });

    it("uses the per-intent path when transactions are unavailable", async () => {
      vi.mocked(assertTransactionSupportAtBoot).mockResolvedValueOnce(false);
      const { db, session } = worldWithClient((fn) => fn());
      const result = await processNppFundRedemptions(db as unknown as Db, options);
      expect(session.withTransaction).not.toHaveBeenCalled();
      expect(result).toEqual({ redemptionsQueued: 1, unitsRedeemed: 9, errors: [] });
    });
  });
});
