import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import type { StateDemographics } from "@/lib/db/types";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { buildModelRegionDemographics } from "@/lib/seeds/international/derive";
import { ukDemographicCategories } from "@/lib/seeds/uk/ukDemographicCategories";
import { getUkModel } from "./layer1Model";
import { calculateStateLean } from "@/lib/utils/demographics";
import { seedUKDemographics } from "./seed";

const { fullOverride } = vi.hoisted(() => ({
  fullOverride: vi.fn(),
}));
vi.mock("@/lib/seeds/loadEraPositionOverride", () => ({
  loadFullOverride: fullOverride,
}));

describe("UK demographic seeding respects the selected era", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fullOverride.mockResolvedValue(null);
  });

  async function seed() {
    const db = createMockDb();
    db.collection("demographicCategories").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(ukDemographicCategories),
    });
    await seedUKDemographics(db as unknown as Db, false, () => {}, "1991-default");
    return db;
  }

  it("writes census-derived 1991 shares unchanged to current and default demographics", async () => {
    const db = await seed();
    const expected = buildModelRegionDemographics(getUkModel("1991"));
    for (const collection of ["stateDemographics", "demographicDefaults"]) {
      const writes = db.collectionMocks[collection].updateOne.mock.calls;
      expect(writes).toHaveLength(12);
      for (const doc of expected) {
        const write = writes.find(([filter]) => filter._id === doc._id);
        const actual = write?.[1].$set as Omit<StateDemographics, "_id">;
        expect(actual.groups, `${collection}/${doc._id}`).toEqual(doc.groups);
        expect(actual.categoryWeights).toEqual(doc.categoryWeights);
        expect(Object.values(actual.groups).reduce((sum, g) => sum + g.population, 0)).toBeCloseTo(
          100,
          1
        );
      }
    }
  });

  it("caches the mean of the same census-derived composition", async () => {
    const db = await seed();
    for (const doc of buildModelRegionDemographics(getUkModel("1991"))) {
      const lean = calculateStateLean(doc, ukDemographicCategories);
      const write = db.collectionMocks.states.updateOne.mock.calls.find(
        ([filter]) => filter._id === doc._id
      );
      expect(write?.[1].$set).toMatchObject({
        cachedEconomicLean: lean.economicLean,
        cachedSocialLean: lean.socialLean,
      });
    }
  });

  it("preserves administrator position and turnout overrides without another era conversion", async () => {
    const override = {
      positions: { age: { young: { economicLean: -1, socialLean: -3 } } },
      turnout: { age: { young: 68 } },
    };
    fullOverride.mockResolvedValue(override);
    const db = await seed();
    expect(fullOverride).toHaveBeenCalledWith("UK", "1991");
    const expected = buildModelRegionDemographics(getUkModel("1991"), override.positions, {
      turnout: override.turnout,
    });
    for (const doc of expected) {
      const write = db.collectionMocks.stateDemographics.updateOne.mock.calls.find(
        ([filter]) => filter._id === doc._id
      );
      expect(write?.[1].$set.groups, doc._id).toEqual(doc.groups);
    }
  });
});
