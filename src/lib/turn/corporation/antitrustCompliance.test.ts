import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import { makeCorporation } from "@/lib/test-utils/factories";
import { processAntitrustCompliance } from "./antitrustCompliance";

vi.mock("@/lib/mechanicalLaws/levels", () => ({ getMechanicalLawLevelsByCountry: vi.fn() }));
vi.mock("@/lib/mechanicalLaws/forcedDivestiture", () => ({ executeForcedDivestiture: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotifications: vi.fn() }));

import {
  getMechanicalLawLevelsByCountry,
  type MechanicalLawLevels,
} from "@/lib/mechanicalLaws/levels";
import { executeForcedDivestiture } from "@/lib/mechanicalLaws/forcedDivestiture";
import { createNotifications } from "@/lib/notifications";

const mockedLevels = vi.mocked(getMechanicalLawLevelsByCountry);
const mockedDivest = vi.mocked(executeForcedDivestiture);
const mockedNotify = vi.mocked(createNotifications);

type Lookups = Parameters<typeof processAntitrustCompliance>[1];

const now = new Date("2026-10-21T00:00:00Z");
const fxByCurrency = new Map<CurrencyCode, number>([["USD", 1]]);

interface LevelSpec {
  subsidiaryLimits?: MechanicalLawLevels["subsidiaryLimits"];
  foreignInvestment?: MechanicalLawLevels["foreignInvestment"];
}

function lawLevels(byCountry: Record<string, LevelSpec>): Map<CountryId, MechanicalLawLevels> {
  const out = new Map<CountryId, MechanicalLawLevels>();
  for (const [countryId, spec] of Object.entries(byCountry)) {
    out.set(countryId as CountryId, {
      competition: 0,
      subsidiaryLimits: spec.subsidiaryLimits ?? 0,
      foreignInvestment: spec.foreignInvestment ?? 0,
    });
  }
  return out;
}

function fakeDb() {
  const bulkWrite = vi.fn(async () => ({}));
  const updateOne = vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 }));
  const collection = vi.fn(() => ({ bulkWrite, updateOne }));
  return { db: { collection } as unknown as Db, collection, bulkWrite, updateOne };
}

function lookupsFor(
  corporations: Corporation[],
  sectorsByCorp = new Map<string, CorporateSector[]>()
): Lookups {
  return {
    corporations,
    sectorsByCorp,
    exchangeRatesByCurrency: fxByCurrency,
  } as unknown as Lookups;
}

/** A US group that owns 80% of a French subsidiary. */
function usGroupWithFrenchSubsidiary() {
  const rootUserId = new ObjectId();
  const root = makeCorporation({
    name: "US Root",
    countryId: "US",
    userId: rootUserId,
  });
  const sub = makeCorporation({
    name: "FR Sub",
    countryId: "FR",
    totalShares: 1000,
    shareholders: [{ corporationId: root._id, shares: 800 }],
  });
  return { root, sub, rootUserId, corporations: [root, sub] };
}

beforeEach(() => {
  mockedLevels.mockReset();
  mockedDivest.mockReset();
  mockedNotify.mockReset();
});

describe("processAntitrustCompliance", () => {
  it("orders a newly breaching subsidiary to divest within the compliance window", async () => {
    const { db, bulkWrite, updateOne } = fakeDb();
    const { root, sub, rootUserId, corporations } = usGroupWithFrenchSubsidiary();
    mockedLevels.mockResolvedValue(lawLevels({ FR: { foreignInvestment: 4 } }));
    const turn = 500;

    const result = await processAntitrustCompliance(db, lookupsFor(corporations), turn, now);

    const order = {
      reason: "foreignBan",
      countryId: "FR",
      rootCorporationId: root._id.toString(),
      sinceTurn: turn,
      dueTurn: turn + 48,
    };
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    expect(bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: { filter: { _id: sub._id }, update: { $set: { antitrustDivestiture: order } } },
      },
    ]);
    expect(updateOne).not.toHaveBeenCalled();
    expect(mockedNotify).toHaveBeenCalledTimes(1);
    expect(mockedNotify).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: rootUserId,
        type: "antitrust_divestiture_ordered",
        title: "Order to give up control of FR Sub",
        metadata: { corporationId: sub._id.toString() },
      }),
    ]);
    expect(mockedNotify.mock.calls[0][0][0].message).toContain("by turn 548");
    expect(result).toEqual({ ordered: 1, cleared: 0, sold: 0, deferred: 0 });
  });

  it("clears the order of a company that no longer breaches the law", async () => {
    const { db, bulkWrite } = fakeDb();
    const { sub, corporations } = usGroupWithFrenchSubsidiary();
    sub.antitrustDivestiture = {
      reason: "foreignBan",
      countryId: "FR",
      rootCorporationId: corporations[0]._id.toString(),
      sinceTurn: 400,
      dueTurn: 448,
    };
    mockedLevels.mockResolvedValue(lawLevels({ FR: { foreignInvestment: 0 } }));

    const result = await processAntitrustCompliance(db, lookupsFor(corporations), 500, now);

    expect(bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: sub._id }, update: { $unset: { antitrustDivestiture: "" } } } },
    ]);
    expect(sub.antitrustDivestiture).toBeUndefined();
    expect(mockedNotify).not.toHaveBeenCalled();
    expect(result).toEqual({ ordered: 0, cleared: 1, sold: 0, deferred: 0 });
  });

  it("sells the stake and clears the order once the deadline has passed", async () => {
    const { db, bulkWrite, updateOne } = fakeDb();
    const { root, sub, rootUserId, corporations } = usGroupWithFrenchSubsidiary();
    sub.antitrustDivestiture = {
      reason: "foreignBan",
      countryId: "FR",
      rootCorporationId: root._id.toString(),
      sinceTurn: 400,
      dueTurn: 499,
    };
    mockedLevels.mockResolvedValue(lawLevels({ FR: { foreignInvestment: 4 } }));
    mockedDivest.mockResolvedValue({ status: "sold", shares: 300, proceedsAnchor: 600 });

    const result = await processAntitrustCompliance(db, lookupsFor(corporations), 500, now);

    expect(mockedDivest).toHaveBeenCalledTimes(1);
    expect(mockedDivest).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ target: sub, parent: root, turn: 500, now })
    );
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(updateOne).toHaveBeenCalledWith(
      { _id: sub._id },
      { $unset: { antitrustDivestiture: "" } }
    );
    expect(mockedNotify).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: rootUserId,
        type: "antitrust_divestiture_executed",
        title: "Stake in FR Sub sold",
      }),
    ]);
    expect(result).toEqual({ ordered: 0, cleared: 0, sold: 1, deferred: 0 });
  });

  it("keeps the order when the forced sale has to wait for the market", async () => {
    const { db, bulkWrite, updateOne } = fakeDb();
    const { root, sub, corporations } = usGroupWithFrenchSubsidiary();
    sub.antitrustDivestiture = {
      reason: "foreignBan",
      countryId: "FR",
      rootCorporationId: root._id.toString(),
      sinceTurn: 400,
      dueTurn: 499,
    };
    mockedLevels.mockResolvedValue(lawLevels({ FR: { foreignInvestment: 4 } }));
    mockedDivest.mockResolvedValue({ status: "deferred", why: "poolShort" });

    const result = await processAntitrustCompliance(db, lookupsFor(corporations), 500, now);

    expect(mockedDivest).toHaveBeenCalledTimes(1);
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
    expect(mockedNotify).not.toHaveBeenCalled();
    expect(sub.antitrustDivestiture?.dueTurn).toBe(499);
    expect(result).toEqual({ ordered: 0, cleared: 0, sold: 0, deferred: 1 });
  });

  it("writes nothing while every law sits at level 0", async () => {
    const { db, collection, bulkWrite, updateOne } = fakeDb();
    const root = makeCorporation({ name: "FR Root", countryId: "FR" });
    const subsidiaries = [10, 20, 30, 40].map((formalizedAtTurn) =>
      makeCorporation({
        name: `FR Sub ${formalizedAtTurn}`,
        countryId: "FR",
        totalShares: 1000,
        shareholders: [{ corporationId: root._id, shares: 800 }],
        subsidiaryFormalizedAtTurn: formalizedAtTurn,
      })
    );
    const sectorsByCorp = new Map<string, CorporateSector[]>([
      [
        subsidiaries[0]._id.toString(),
        [
          {
            countryId: "FR",
            sectorType: "energy",
            revenue: 1000,
          } as unknown as CorporateSector,
        ],
      ],
    ]);
    mockedLevels.mockResolvedValue(
      lawLevels({ FR: { subsidiaryLimits: 0, foreignInvestment: 0 } })
    );

    const result = await processAntitrustCompliance(
      db,
      lookupsFor([root, ...subsidiaries], sectorsByCorp),
      500,
      now
    );

    expect(collection).not.toHaveBeenCalled();
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
    expect(mockedDivest).not.toHaveBeenCalled();
    expect(mockedNotify).not.toHaveBeenCalled();
    expect(result).toEqual({ ordered: 0, cleared: 0, sold: 0, deferred: 0 });
  });
});
