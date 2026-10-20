import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { NotificationInput } from "@/lib/notifications";
import { makeCorporation } from "@/lib/test-utils/factories";
import type { ControlRow, IndustryRow } from "@/lib/mechanicalLaws/enforcementRules";
import type { MechanicalLawLevel } from "@/lib/mechanicalLaws/rules";
import { processBreakupCases } from "./antitrustBreakups";

vi.mock("@/lib/corporations/mergerReview/authority", () => ({
  resolveMergerAuthority: vi.fn(),
}));

import { resolveMergerAuthority } from "@/lib/corporations/mergerReview/authority";

const HOLDER_ID = new ObjectId();
const LEVELS = new Map<string, MechanicalLawLevel>([["US", 3]]);

function fakeDb() {
  const bulkWrite = vi.fn(async () => ({}));
  const db = { collection: vi.fn(() => ({ bulkWrite })) } as unknown as Db;
  return { db, bulkWrite };
}

function dominantIndustry(rootId: string): IndustryRow[] {
  return [
    { corpId: rootId, countryId: "US", sectorType: "manufacturing", revenue: 60 },
    { corpId: "rival", countryId: "US", sectorType: "manufacturing", revenue: 40 },
  ];
}

function controlRows(rootId: string): ControlRow[] {
  return [
    { id: rootId, countryId: "US" },
    { id: "rival", countryId: "US" },
  ];
}

describe("processBreakupCases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveMergerAuthority).mockResolvedValue({
      seatId: "competition_minister",
      seatName: "Minister",
      countryId: "US",
      holderUserId: HOLDER_ID,
    });
  });

  it("opens a case with decisions due six turns out and notifies owner and authority", async () => {
    const root = makeCorporation({ name: "Root Co", countryId: "US" });
    const rootId = root._id.toString();
    const { db, bulkWrite } = fakeDb();
    const notices: NotificationInput[] = [];

    const result = await processBreakupCases(db, {
      corporations: [root],
      rows: controlRows(rootId),
      industry: dominantIndustry(rootId),
      competitionLevelByCountry: LEVELS,
      turn: 100,
      currentYear: 1990,
      notices,
    });

    expect(result).toEqual({ opened: 1, ordered: 0, dismissed: 0 });
    expect(resolveMergerAuthority).toHaveBeenCalledWith(db, "US", 1990);
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const ops = bulkWrite.mock.calls[0][0] as Array<{
      updateOne: { update: { $set: { antitrustCase: Record<string, unknown> } } };
    }>;
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.update.$set.antitrustCase).toEqual({
      countryId: "US",
      sectorType: "manufacturing",
      sharePercent: 60,
      thresholdPercent: 50,
      openedTurn: 100,
      decideByTurn: 106,
    });

    expect(notices.map((n) => n.title)).toEqual([
      "Competition case opened",
      "Breakup case to decide",
    ]);
    expect(notices[0].userId).toBe(root.userId);
    expect(notices[1].userId).toBe(HOLDER_ID);
  });

  it("orders a divestiture at the deadline when the group is still dominant", async () => {
    const root = makeCorporation({
      name: "Root Co",
      countryId: "US",
      antitrustCase: {
        countryId: "US",
        sectorType: "manufacturing",
        sharePercent: 60,
        thresholdPercent: 50,
        openedTurn: 100,
        decideByTurn: 106,
      },
    });
    const rootId = root._id.toString();
    const { db, bulkWrite } = fakeDb();
    const notices: NotificationInput[] = [];

    const result = await processBreakupCases(db, {
      corporations: [root],
      rows: controlRows(rootId),
      industry: dominantIndustry(rootId),
      competitionLevelByCountry: LEVELS,
      turn: 106,
      currentYear: 1990,
      notices,
    });

    expect(result).toEqual({ opened: 0, ordered: 1, dismissed: 0 });
    const ops = bulkWrite.mock.calls[0][0] as Array<{
      updateOne: {
        update: {
          $set: { pendingDivestiture: Record<string, unknown> };
          $unset: Record<string, string>;
        };
      };
    }>;
    const obligation = ops[0].updateOne.update.$set.pendingDivestiture;
    expect(obligation).toMatchObject({
      sectorType: "manufacturing",
      thresholdPercent: 50,
      countryId: "US",
      dueTurn: 118,
    });
    expect(obligation.reviewId).toBeInstanceOf(ObjectId);
    expect(ops[0].updateOne.update.$unset).toEqual({ antitrustCase: "" });
    expect(root.pendingDivestiture).toMatchObject({ dueTurn: 118 });
    expect(root.antitrustCase).toBeUndefined();
    expect(notices.map((n) => n.title)).toEqual(["Breakup ordered"]);
  });

  it("dismisses the case when the group is no longer dominant", async () => {
    const root = makeCorporation({
      name: "Root Co",
      countryId: "US",
      antitrustCase: {
        countryId: "US",
        sectorType: "manufacturing",
        sharePercent: 60,
        thresholdPercent: 50,
        openedTurn: 100,
        decideByTurn: 106,
      },
    });
    const rootId = root._id.toString();
    const { db, bulkWrite } = fakeDb();
    const notices: NotificationInput[] = [];

    const result = await processBreakupCases(db, {
      corporations: [root],
      rows: controlRows(rootId),
      industry: [
        { corpId: rootId, countryId: "US", sectorType: "manufacturing", revenue: 30 },
        { corpId: "rival", countryId: "US", sectorType: "manufacturing", revenue: 70 },
      ],
      competitionLevelByCountry: LEVELS,
      turn: 106,
      currentYear: 1990,
      notices,
    });

    expect(result).toEqual({ opened: 0, ordered: 0, dismissed: 1 });
    const ops = bulkWrite.mock.calls[0][0] as Array<{
      updateOne: { update: { $unset: Record<string, string>; $set?: unknown } };
    }>;
    expect(ops[0].updateOne.update.$unset).toEqual({ antitrustCase: "" });
    expect(ops[0].updateOne.update.$set).toBeUndefined();
    expect(root.antitrustCase).toBeUndefined();
    expect(notices.map((n) => n.title)).toEqual(["Competition case closed"]);
  });

  it("dismisses on a dismiss decision even while the group is dominant", async () => {
    const root = makeCorporation({
      name: "Root Co",
      countryId: "US",
      antitrustCase: {
        countryId: "US",
        sectorType: "manufacturing",
        sharePercent: 60,
        thresholdPercent: 50,
        openedTurn: 100,
        decideByTurn: 106,
        decision: "dismiss",
        decidedTurn: 103,
      },
    });
    const rootId = root._id.toString();
    const { db, bulkWrite } = fakeDb();
    const notices: NotificationInput[] = [];

    const result = await processBreakupCases(db, {
      corporations: [root],
      rows: controlRows(rootId),
      industry: dominantIndustry(rootId),
      competitionLevelByCountry: LEVELS,
      turn: 103,
      currentYear: 1990,
      notices,
    });

    // The decided case closes even while the group is still dominant. The same
    // pass may then open a fresh case, which this test does not pin here.
    expect(result.dismissed).toBe(1);
    expect(result.ordered).toBe(0);
    const ops = bulkWrite.mock.calls[0][0] as Array<{
      updateOne: { update: { $unset: Record<string, string> } };
    }>;
    expect(ops[0].updateOne.update.$unset).toEqual({ antitrustCase: "" });
    expect(notices[0].title).toBe("Competition case closed");
  });

  it("opens no new case for a root already under a divestiture order", async () => {
    const root = makeCorporation({
      name: "Root Co",
      countryId: "US",
      pendingDivestiture: {
        reviewId: new ObjectId(),
        sectorType: "manufacturing",
        dueTurn: 110,
        thresholdPercent: 50,
        countryId: "US",
      },
    });
    const rootId = root._id.toString();
    const { db, bulkWrite } = fakeDb();
    const notices: NotificationInput[] = [];

    const result = await processBreakupCases(db, {
      corporations: [root],
      rows: controlRows(rootId),
      industry: dominantIndustry(rootId),
      competitionLevelByCountry: LEVELS,
      turn: 100,
      currentYear: 1990,
      notices,
    });

    expect(result).toEqual({ opened: 0, ordered: 0, dismissed: 0 });
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
    expect(resolveMergerAuthority).not.toHaveBeenCalled();
  });
});
