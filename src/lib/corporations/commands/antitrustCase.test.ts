import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { decideAntitrustCase } from "./antitrustCase";

vi.mock("@/lib/corporations/mergerReview/authority", () => ({
  resolveMergerAuthority: vi.fn(),
}));

import { resolveMergerAuthority } from "@/lib/corporations/mergerReview/authority";

const VIEWER_ID = new ObjectId();
const OPEN_CASE = {
  countryId: "US",
  sectorType: "manufacturing",
  sharePercent: 60,
  thresholdPercent: 50,
  openedTurn: 100,
  decideByTurn: 106,
};

function corporation(antitrustCase?: Corporation["antitrustCase"]) {
  return { _id: new ObjectId(), antitrustCase } as Pick<Corporation, "_id" | "antitrustCase">;
}

function fakeDb(modifiedCount = 1) {
  const updateOne = vi.fn(async () => ({ modifiedCount }));
  const db = { collection: vi.fn(() => ({ updateOne })) } as unknown as Db;
  return { db, updateOne };
}

describe("decideAntitrustCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveMergerAuthority).mockResolvedValue({
      seatId: "competition_minister",
      seatName: "Minister",
      countryId: "US",
      holderUserId: VIEWER_ID,
    });
  });

  it("returns 400 when there is no open case", async () => {
    const { db, updateOne } = fakeDb();

    const result = await decideAntitrustCase(db, corporation(), VIEWER_ID, "order", 100, null);

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "There is no open competition case.",
    });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("returns 409 when the case has already been decided", async () => {
    const { db, updateOne } = fakeDb();

    const result = await decideAntitrustCase(
      db,
      corporation({ ...OPEN_CASE, decision: "order", decidedTurn: 103 }),
      VIEWER_ID,
      "dismiss",
      104,
      null
    );

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "This case has already been decided.",
    });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("returns 403 when the viewer does not hold the authority seat", async () => {
    vi.mocked(resolveMergerAuthority).mockResolvedValue({
      seatId: "competition_minister",
      seatName: "Minister",
      countryId: "US",
      holderUserId: new ObjectId(),
    });
    const { db, updateOne } = fakeDb();

    const result = await decideAntitrustCase(
      db,
      corporation({ ...OPEN_CASE }),
      VIEWER_ID,
      "order",
      104,
      null
    );

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Only the competition authority of this country can decide the case.",
    });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("writes the decision and the turn it was taken", async () => {
    const { db, updateOne } = fakeDb();
    const corp = corporation({ ...OPEN_CASE });

    const result = await decideAntitrustCase(db, corp, VIEWER_ID, "order", 104, null);

    expect(result).toEqual({ ok: true });
    expect(updateOne).toHaveBeenCalledWith(
      {
        _id: corp._id,
        "antitrustCase.openedTurn": 100,
        "antitrustCase.decision": { $exists: false },
      },
      { $set: { "antitrustCase.decision": "order", "antitrustCase.decidedTurn": 104 } }
    );
  });
});
