import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { defect } from "./AHD-951-orphan-null-party-seats";
import type { HealContext } from "../types";

const ctx: HealContext = { env: "prod", dryRun: true, now: new Date("2026-11-02T03:00:00Z") };

/**
 * The prod row AHD-951 flagged on 2026-11-02: a holder-less UK Commons bloc
 * that a scheduled by-election was about to fill, not a vacate-bug orphan.
 */
const ANCHOR_ID = new ObjectId("6ae37068c5619f97aeab82b3");
const ORPHAN_ID = new ObjectId("6ae37068c5619f97aeab82b4");

const ANCHOR_ROW = {
  _id: ANCHOR_ID,
  countryId: "UK",
  officeType: "commons",
  state: "LON",
  seatsHeld: 26,
  party: null,
  characterId: null,
  nppId: null,
};

const ORPHAN_ROW = {
  _id: ORPHAN_ID,
  countryId: "UK",
  officeType: "commons",
  state: "NEE",
  seatsHeld: 4,
  party: null,
  characterId: null,
  nppId: null,
};

function cursor(docs: unknown[]) {
  return { toArray: async () => docs };
}

function world(rows: unknown[], vacancies: unknown[] = []) {
  const db = createMockDb();
  const officials = db.collection("electedOfficials");
  officials.find.mockReturnValue(cursor(rows));
  officials.countDocuments.mockResolvedValue(0);
  // Honour the status filter so a terminal vacancy behaves like it does in Mongo.
  db.collection("ukCommonsVacancies").find.mockImplementation(
    (filter: { status?: { $in?: string[] } }) => {
      const statuses = filter?.status?.$in;
      const matching = statuses
        ? vacancies.filter((v) => statuses.includes((v as { status: string }).status))
        : vacancies;
      return cursor(matching);
    }
  );
  return db;
}

describe("AHD-951 live UK Commons vacancy anchors", () => {
  it("does not treat a row anchored by a live vacancy as an orphan", async () => {
    const db = world([ANCHOR_ROW], [{ officialId: ANCHOR_ID, status: "scheduled" }]);

    const detected = await defect.detect!(db as unknown as Db, ctx);
    expect(detected.affected).toBe(0);
    expect(detected.sample).toEqual([]);

    const healPlan = await defect.plan!(db as unknown as Db, ctx);
    expect(healPlan.affected).toBe(0);
    expect(healPlan.touched[0]!.ids).toEqual([]);

    // Even if an old plan named the row, apply must re-check the anchor.
    const applied = await defect.apply!(
      db as unknown as Db,
      {
        ...healPlan,
        touched: [{ collection: "electedOfficials", ids: [String(ANCHOR_ID)] }],
      },
      ctx
    );
    const deletion = db.collectionMocks["electedOfficials"]!.deleteMany.mock.calls[0]![0] as {
      _id: { $in: unknown[] };
    };
    expect(deletion._id.$in).toEqual([]);
    expect(applied.documentsDeleted).toBe(0);
  });

  it("still heals a genuine orphan beside the anchor", async () => {
    const db = world([ANCHOR_ROW, ORPHAN_ROW], [{ officialId: ANCHOR_ID, status: "open" }]);
    db.collectionMocks["electedOfficials"]!.deleteMany.mockResolvedValue({ deletedCount: 1 });

    const detected = await defect.detect!(db as unknown as Db, ctx);
    expect(detected.affected).toBe(1);
    expect(detected.sample).toEqual([
      {
        id: String(ORPHAN_ID),
        countryId: "UK",
        officeType: "commons",
        state: "NEE",
        seatsHeld: 4,
      },
    ]);

    const healPlan = await defect.plan!(db as unknown as Db, ctx);
    expect(healPlan.touched[0]!.ids).toEqual([String(ORPHAN_ID)]);

    const applied = await defect.apply!(db as unknown as Db, healPlan, ctx);
    const deletion = db.collectionMocks["electedOfficials"]!.deleteMany.mock.calls[0]![0] as {
      _id: { $in: unknown[] };
    };
    expect(deletion._id.$in).toEqual([ORPHAN_ID]);
    expect(applied.documentsDeleted).toBe(1);
  });

  it("stops protecting the row once its vacancy is filled", async () => {
    const db = world([ANCHOR_ROW], [{ officialId: ANCHOR_ID, status: "filled" }]);

    const detected = await defect.detect!(db as unknown as Db, ctx);
    expect(detected.affected).toBe(1);
    expect(detected.sample[0]).toMatchObject({ id: String(ANCHOR_ID), seatsHeld: 26 });
  });

  it("verifies clean when only the anchored row remains", async () => {
    const db = world([ANCHOR_ROW], [{ officialId: ANCHOR_ID, status: "scheduled" }]);

    const verified = await defect.verify!(db as unknown as Db, ctx);
    expect(verified.ok).toBe(true);
    expect(verified.remaining).toBe(0);
  });
});

describe("AHD-951 defect registration", () => {
  it("keeps the turn-lock guard and the affected cap", () => {
    expect(defect.idempotent).toBe(true);
    expect(defect.guards).toContain("turn-lock-free");
    expect(defect.guards).toContain("max-affected:500");
  });

  it("pins the deployed code fix", () => {
    expect(defect.codeFix?.requiredCommit).toBe("8972afb65990046691e36f44f88f94b0a3c0a4cf");
  });
});
