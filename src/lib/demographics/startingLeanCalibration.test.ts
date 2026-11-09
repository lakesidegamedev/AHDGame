/**
 * The 2027 starting leans cached on region documents come from the census
 * electorate. This pins how far that moves any region from the lean the
 * stored voter-group rows produced, so a census edit cannot silently re-draw
 * the opening map.
 */
import { describe, expect, it } from "vitest";
import { ALL_COUNTRY_IDS } from "@/lib/constants/countries";
import type { DemographicCategory, StateDemographics } from "@/lib/db/types";
import { stateCensusData2027 } from "@/lib/countries/us/data/usStateCensusData2027";
import { demographicCategories } from "@/lib/seeds/demographicCategories";
import { buildModelRegionDemographics, getCountryLayer1Model } from "@/lib/seeds/international";
import { registerAndGenerate } from "@/lib/seeds/stateDemographics";
import { calculateStateLean } from "@/lib/utils/demographics";
import { censusStateLean } from "./censusLean";

/** Largest allowed move of any region on either lean axis. */
const MAX_REGION_MOVE = 2;

interface RegionRow {
  countryId: string;
  regionId: string;
  move: number;
}

function movesFor(
  countryId: string,
  docs: StateDemographics[],
  categories: DemographicCategory[]
): RegionRow[] {
  return docs.map((doc) => {
    const groups = calculateStateLean(doc, categories);
    const census = censusStateLean(doc, {
      countryId,
      stateId: String(doc._id),
      preset: "2027-default",
      year: 2027,
      startingYear: 2027,
    });
    return {
      countryId,
      regionId: String(doc._id),
      move: Math.max(
        Math.abs(census.economicLean - groups.economicLean),
        Math.abs(census.socialLean - groups.socialLean)
      ),
    };
  });
}

function rowsFor(countryId: string): RegionRow[] {
  if (countryId === "US") {
    const docs = Object.entries(stateCensusData2027).map(([id, config]) =>
      registerAndGenerate(id, config, "2027", { layer1Positions: true })
    );
    return movesFor("US", docs, demographicCategories);
  }
  const model = getCountryLayer1Model(countryId, "2027");
  if (!model) return [];
  const category = {
    _id: model.categoryId,
    groups: model.groupIds.map((id) => ({
      id,
      defaultEconomicLean: model.defaultLeans[id]?.economicLean ?? 0,
      defaultSocialLean: model.defaultLeans[id]?.socialLean ?? 0,
    })),
  } as unknown as DemographicCategory;
  return movesFor(countryId, buildModelRegionDemographics(model), [category]);
}

describe("2027 starting lean: census versus stored voter groups", () => {
  for (const countryId of ALL_COUNTRY_IDS) {
    it(`${countryId}: no region moves more than ${MAX_REGION_MOVE} lean points`, () => {
      const rows = rowsFor(countryId);
      const tooFar = rows.filter((row) => !(row.move <= MAX_REGION_MOVE));
      expect(tooFar).toEqual([]);
    });
  }
});
