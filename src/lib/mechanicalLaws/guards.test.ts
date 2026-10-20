import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Corporation } from "@/lib/db/types";
import { makeCorporation } from "@/lib/test-utils/factories";
import { assertForeignControlAllowed, assertSubsidiaryWithinCap, wouldGainControl } from "./guards";

vi.mock("./levels", () => ({ getMechanicalLawLevels: vi.fn() }));

import { getMechanicalLawLevels, type MechanicalLawLevels } from "./levels";

const mockedLevels = vi.mocked(getMechanicalLawLevels);

function levels(
  subsidiaryLimits: MechanicalLawLevels["subsidiaryLimits"],
  foreignInvestment: MechanicalLawLevels["foreignInvestment"]
): MechanicalLawLevels {
  return { competition: 0, subsidiaryLimits, foreignInvestment };
}

/** A 1000 share company whose corporate holder owns 60% of the votes. */
function subsidiaryOf(holderId: ObjectId, countryId: string): Corporation {
  return makeCorporation({
    countryId: countryId as Corporation["countryId"],
    totalShares: 1000,
    shareholders: [{ corporationId: holderId, shares: 600 }],
  });
}

function fakeDb(corps: readonly Corporation[]) {
  const byId = new Map(corps.map((c) => [c._id.toString(), c]));
  const findOne = vi.fn(
    async (filter: { _id: ObjectId }) => byId.get(filter._id.toString()) ?? null
  );
  const toArray = vi.fn(async () => [...corps]);
  const find = vi.fn(() => ({ toArray }));
  const collection = vi.fn(() => ({ findOne, find }));
  return { db: { collection } as unknown as Db, collection, findOne, find, toArray };
}

beforeEach(() => {
  mockedLevels.mockReset();
});

describe("wouldGainControl", () => {
  const buyerId = new ObjectId();
  const otherId = new ObjectId();
  const targetWith = (shares: number, totalShares = 1000) => ({
    totalShares,
    shareholders: [{ corporationId: buyerId, shares }],
  });

  it("is true when the purchase takes the buyer from half or less to over half", () => {
    expect(wouldGainControl(targetWith(400), buyerId, 200)).toBe(true);
    expect(wouldGainControl(targetWith(500), buyerId, 10)).toBe(true);
    expect(wouldGainControl(targetWith(0), buyerId, 501)).toBe(true);
  });

  it("is false when the buyer would still hold half or less", () => {
    expect(wouldGainControl(targetWith(500), buyerId, 0)).toBe(false);
    expect(wouldGainControl(targetWith(200), buyerId, 300)).toBe(false);
    expect(wouldGainControl(targetWith(400), buyerId, 100)).toBe(false);
  });

  it("is false when the buyer already controls the target", () => {
    expect(wouldGainControl(targetWith(600), buyerId, 100)).toBe(false);
  });

  it("ignores holders other than the buyer", () => {
    const target = {
      totalShares: 1000,
      shareholders: [{ corporationId: otherId, shares: 900 }],
    };
    expect(wouldGainControl(target, buyerId, 501)).toBe(true);
    expect(wouldGainControl(target, buyerId, 500)).toBe(false);
  });

  it("is false when the target has no shares", () => {
    expect(wouldGainControl(targetWith(0, 0), buyerId, 1000)).toBe(false);
  });
});

describe("assertForeignControlAllowed", () => {
  const usParentId = new ObjectId();
  const frParentId = new ObjectId();

  const usParent = makeCorporation({ _id: usParentId, countryId: "US" });
  // Headquartered in FR, but controlled from the US: the walk finds the real root.
  const frSubsidiaryOfUs = subsidiaryOf(usParentId, "FR");
  const frParent = makeCorporation({ _id: frParentId, countryId: "FR" });
  const frSubsidiaryOfFr = subsidiaryOf(frParentId, "FR");
  const corps = [usParent, frSubsidiaryOfUs, frParent, frSubsidiaryOfFr];

  it("allows a domestic buyer without reading the law", async () => {
    const { db, collection } = fakeDb(corps);

    const rejection = await assertForeignControlAllowed(db, frParent, { countryId: "FR" });

    expect(rejection).toBeNull();
    expect(collection).not.toHaveBeenCalled();
    expect(mockedLevels).not.toHaveBeenCalled();
  });

  it("allows a buyer whose real root is domestic", async () => {
    const { db } = fakeDb(corps);
    mockedLevels.mockResolvedValue(levels(0, 4));

    const rejection = await assertForeignControlAllowed(db, frSubsidiaryOfFr, {
      countryId: "FR",
    });

    expect(rejection).toBeNull();
  });

  it("allows a foreign buyer when the country does not ban foreign investment", async () => {
    const { db } = fakeDb(corps);
    mockedLevels.mockResolvedValue(levels(0, 3));

    const rejection = await assertForeignControlAllowed(db, frSubsidiaryOfUs, {
      countryId: "FR",
    });

    expect(rejection).toBeNull();
    expect(mockedLevels).toHaveBeenCalledWith(db, "FR");
  });

  it("refuses a foreign-controlled buyer in a country that bans foreign investment", async () => {
    const { db, findOne } = fakeDb(corps);
    mockedLevels.mockResolvedValue(levels(0, 4));

    const rejection = await assertForeignControlAllowed(db, frSubsidiaryOfUs, {
      countryId: "FR",
    });

    // Root is found by following the controlling corporate holder up to the US parent.
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(400);
    expect(rejection?.error).toContain("Foreign Investment Act");
  });
});

describe("assertSubsidiaryWithinCap", () => {
  const rootId = new ObjectId();

  function group(subsidiaryCountries: string[]) {
    const root = makeCorporation({ _id: rootId, countryId: "FR" });
    const subsidiaries = subsidiaryCountries.map((countryId) => subsidiaryOf(rootId, countryId));
    return { root, subsidiaries, corps: [root, ...subsidiaries] };
  }

  it("allows everything at level 0 without touching corporations", async () => {
    const { root, corps } = group(["FR", "FR", "FR", "FR", "FR"]);
    const { db, findOne, find } = fakeDb(corps);
    mockedLevels.mockResolvedValue(levels(0, 0));

    const rejection = await assertSubsidiaryWithinCap(db, root, "FR");

    expect(rejection).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it("allows a subsidiary that still fits under the cap", async () => {
    const { root, corps } = group(["FR", "FR"]);
    const { db } = fakeDb(corps);
    mockedLevels.mockResolvedValue(levels(4, 0));

    // Cap is 3 at level 4; two existing plus the new one is exactly the cap.
    const rejection = await assertSubsidiaryWithinCap(db, root, "FR");

    expect(rejection).toBeNull();
  });

  it("does not count subsidiaries headquartered in another country", async () => {
    const { root, corps } = group(["JP", "JP", "JP"]);
    const { db } = fakeDb(corps);
    mockedLevels.mockResolvedValue(levels(4, 0));

    const rejection = await assertSubsidiaryWithinCap(db, root, "FR");

    expect(rejection).toBeNull();
  });

  it("refuses a new subsidiary when the group already runs the cap", async () => {
    const { root, corps } = group(["FR", "FR", "FR"]);
    const { db } = fakeDb(corps);
    mockedLevels.mockResolvedValue(levels(4, 0));

    const rejection = await assertSubsidiaryWithinCap(db, root, "FR");

    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(400);
    expect(rejection?.error).toContain("at most 3 subsidiaries");
    expect(rejection?.error).toContain("already runs 3");
  });

  it("excludes the corporation being moved out of the group", async () => {
    const { root, subsidiaries, corps } = group(["FR", "FR", "FR"]);
    const { db } = fakeDb(corps);
    mockedLevels.mockResolvedValue(levels(4, 0));

    const rejection = await assertSubsidiaryWithinCap(db, root, "FR", subsidiaries[2]._id);

    expect(rejection).toBeNull();
  });
});
