import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { FundedReceipt } from "@/lib/market/producerMarket/fundedSectorRules";
import { TRANSITION_WINDOW_TURNS } from "@/lib/market/producerMarket/transitionRules";
import { bulkOps, createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { CorporationLookups } from "./types";
import { markStrugglingTransitionSectors } from "./transitionStruggling";

const createNotifications = vi.fn();
vi.mock("@/lib/notifications", () => ({
  createNotifications: (...args: unknown[]) => createNotifications(...args),
}));

const FIRST_FUNDED_TURN = 100;

function corporation(overrides: Record<string, unknown> = {}): Corporation {
  return {
    _id: new ObjectId(),
    name: "Acme",
    ceoType: "character",
    userId: new ObjectId(),
    ...overrides,
  } as unknown as Corporation;
}

function sector(corporationId: ObjectId, overrides: Record<string, unknown> = {}): CorporateSector {
  return {
    _id: new ObjectId(),
    corporationId,
    ...overrides,
  } as unknown as CorporateSector;
}

function receipt(overrides: Partial<FundedReceipt> = {}): FundedReceipt {
  return { revenue: 100, profit: 10, producedUnits: 10, soldUnits: 10, ...overrides };
}

function lookups(
  corporations: Corporation[],
  sectors: CorporateSector[]
): Pick<CorporationLookups, "corporations" | "sectorsByCorp"> {
  const sectorsByCorp = new Map<string, CorporateSector[]>();
  for (const s of sectors) {
    const key = s.corporationId.toString();
    sectorsByCorp.set(key, [...(sectorsByCorp.get(key) ?? []), s]);
  }
  return { corporations, sectorsByCorp };
}

describe("markStrugglingTransitionSectors", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  it("does nothing outside the transition window", async () => {
    const corp = corporation();
    const plant = sector(corp._id);
    const receipts = new Map([[plant._id.toString(), receipt({ soldUnits: 0 })]]);

    const result = await markStrugglingTransitionSectors(
      db as unknown as Db,
      lookups([corp], [plant]),
      receipts,
      FIRST_FUNDED_TURN + TRANSITION_WINDOW_TURNS,
      FIRST_FUNDED_TURN
    );

    expect(result).toEqual({ marked: 0, owners: 0 });
    expect(db.collection).not.toHaveBeenCalled();
    expect(createNotifications).not.toHaveBeenCalled();
  });

  it("marks zero-sales sectors and notifies the owner once for several marks", async () => {
    const ownerId = new ObjectId();
    const corp = corporation({ userId: ownerId, ceoType: "character" });
    const first = sector(corp._id);
    const second = sector(corp._id);
    const receipts = new Map([
      [first._id.toString(), receipt({ soldUnits: 0 })],
      [second._id.toString(), receipt({ soldUnits: 0, profit: -3 })],
    ]);

    const result = await markStrugglingTransitionSectors(
      db as unknown as Db,
      lookups([corp], [first, second]),
      receipts,
      105,
      FIRST_FUNDED_TURN
    );

    expect(result).toEqual({ marked: 2, owners: 1 });
    const ops = bulkOps(db.collectionMocks.corporateSectors.bulkWrite);
    expect(ops).toHaveLength(2);
    expect(ops[0][1]).toEqual({
      $set: { cutoverStruggling: { sinceTurn: 105, reason: "zeroSales", notified: true } },
    });
    expect(ops[1][1]).toEqual({
      $set: { cutoverStruggling: { sinceTurn: 105, reason: "zeroSales", notified: true } },
    });

    expect(createNotifications).toHaveBeenCalledTimes(1);
    const notices = createNotifications.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      userId: ownerId,
      type: "market_transition_review",
      metadata: { corporationId: corp._id.toHexString() },
    });
  });

  it("does not re-mark a sector that is already eligible", async () => {
    const corp = corporation();
    const plant = sector(corp._id, {
      cutoverTransition: {
        mismatched: true,
        legacyRevenueAnchor: 100,
        fundedRevenueAnchor: 20,
        basisTurns: 5,
      },
    });
    const receipts = new Map([[plant._id.toString(), receipt({ soldUnits: 0 })]]);

    const result = await markStrugglingTransitionSectors(
      db as unknown as Db,
      lookups([corp], [plant]),
      receipts,
      105,
      FIRST_FUNDED_TURN
    );

    expect(result).toEqual({ marked: 0, owners: 0 });
    expect(db.collection).not.toHaveBeenCalled();
    expect(createNotifications).not.toHaveBeenCalled();
  });

  it("skips a mothballed sector", async () => {
    const corp = corporation();
    const plant = sector(corp._id, { mothballed: true });
    const receipts = new Map([[plant._id.toString(), receipt({ soldUnits: 0 })]]);

    const result = await markStrugglingTransitionSectors(
      db as unknown as Db,
      lookups([corp], [plant]),
      receipts,
      105,
      FIRST_FUNDED_TURN
    );

    expect(result).toEqual({ marked: 0, owners: 0 });
    expect(db.collection).not.toHaveBeenCalled();
    expect(createNotifications).not.toHaveBeenCalled();
  });

  it("skips a state-owned corporation", async () => {
    const corp = corporation({ countryOwnerId: "US" });
    const plant = sector(corp._id);
    const receipts = new Map([[plant._id.toString(), receipt({ soldUnits: 0 })]]);

    const result = await markStrugglingTransitionSectors(
      db as unknown as Db,
      lookups([corp], [plant]),
      receipts,
      105,
      FIRST_FUNDED_TURN
    );

    expect(result).toEqual({ marked: 0, owners: 0 });
    expect(db.collection).not.toHaveBeenCalled();
    expect(createNotifications).not.toHaveBeenCalled();
  });

  it("does not notify an owner who already had a marked sector", async () => {
    const ownerId = new ObjectId();
    const corp = corporation({ userId: ownerId });
    const alreadyMarked = sector(corp._id, {
      cutoverStruggling: { sinceTurn: 103, reason: "losing" },
    });
    const newlyStruggling = sector(corp._id);
    const receipts = new Map([[newlyStruggling._id.toString(), receipt({ soldUnits: 0 })]]);

    const result = await markStrugglingTransitionSectors(
      db as unknown as Db,
      lookups([corp], [alreadyMarked, newlyStruggling]),
      receipts,
      105,
      FIRST_FUNDED_TURN
    );

    expect(result).toEqual({ marked: 1, owners: 0 });
    expect(bulkOps(db.collectionMocks.corporateSectors.bulkWrite)).toHaveLength(1);
    expect(createNotifications).not.toHaveBeenCalled();
  });

  it("tells an owner again about newly marked sectors once the repeat gap has passed", async () => {
    const ownerId = new ObjectId();
    const corp = corporation({ userId: ownerId });
    const alreadyMarked = sector(corp._id, {
      cutoverStruggling: { sinceTurn: 101, reason: "losing", notified: true },
    });
    const quietlyMarked = sector(corp._id, {
      cutoverStruggling: { sinceTurn: 104, reason: "losing", notified: false },
    });
    const newlyStruggling = sector(corp._id);
    const receipts = new Map([[newlyStruggling._id.toString(), receipt({ profit: -5 })]]);

    const result = await markStrugglingTransitionSectors(
      db as unknown as Db,
      lookups([corp], [alreadyMarked, quietlyMarked, newlyStruggling]),
      receipts,
      107,
      FIRST_FUNDED_TURN
    );

    expect(result).toEqual({ marked: 1, owners: 1 });
    expect(bulkOps(db.collectionMocks.corporateSectors.bulkWrite)[0][1]).toEqual({
      $set: { cutoverStruggling: { sinceTurn: 107, reason: "losing", notified: true } },
    });
    const notices = createNotifications.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(notices[0].message).toContain("1 more of your sectors");
  });

  it("marks quietly inside the repeat gap", async () => {
    const corp = corporation();
    const alreadyMarked = sector(corp._id, {
      cutoverStruggling: { sinceTurn: 104, reason: "losing", notified: true },
    });
    const newlyStruggling = sector(corp._id);
    const receipts = new Map([[newlyStruggling._id.toString(), receipt({ soldUnits: 0 })]]);

    const result = await markStrugglingTransitionSectors(
      db as unknown as Db,
      lookups([corp], [alreadyMarked, newlyStruggling]),
      receipts,
      107,
      FIRST_FUNDED_TURN
    );

    expect(result).toEqual({ marked: 1, owners: 0 });
    expect(bulkOps(db.collectionMocks.corporateSectors.bulkWrite)[0][1]).toEqual({
      $set: { cutoverStruggling: { sinceTurn: 107, reason: "zeroSales", notified: false } },
    });
    expect(createNotifications).not.toHaveBeenCalled();
  });

  it("marks an NPP corporation's sector without notifying anyone", async () => {
    const corp = corporation({ ceoType: "npp", userId: new ObjectId() });
    const plant = sector(corp._id);
    const receipts = new Map([[plant._id.toString(), receipt({ soldUnits: 0 })]]);

    const result = await markStrugglingTransitionSectors(
      db as unknown as Db,
      lookups([corp], [plant]),
      receipts,
      105,
      FIRST_FUNDED_TURN
    );

    expect(result).toEqual({ marked: 1, owners: 0 });
    expect(bulkOps(db.collectionMocks.corporateSectors.bulkWrite)).toHaveLength(1);
    expect(createNotifications).not.toHaveBeenCalled();
  });
});
