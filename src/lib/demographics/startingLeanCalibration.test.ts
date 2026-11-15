/**
 * The 2027 starting leans cached on region documents come from the census
 * electorate. This pins how far that moves any region from the lean the
 * stored voter-group rows produced, so a census edit cannot silently re-draw
 * the opening map.
 */
import { describe, expect, it } from "vitest";
import { ALL_COUNTRY_IDS } from "@/lib/constants/countries";
import type { DemographicCategory, CensusGroupView } from "@/lib/db/types";
import { stateCensusData2027 } from "@/lib/countries/us/data/usStateCensusData2027";
import { demographicCategories } from "@/lib/seeds/calibration/groupModelCategories";
import { buildModelRegionDemographics, getCountryLayer1Model } from "@/lib/seeds/international";
import { registerAndGenerate } from "@/lib/seeds/stateDemographics";
import { calculateStateLean } from "@/lib/utils/demographics";
import { censusStateLean } from "./censusLean";
import {
  LEAN_PER_MARGIN_POINT,
  usOpeningLeanTarget2027,
} from "@/lib/countries/us/data/usStatePositions2027Target";
import {
  CA_FEDERAL_VOTE_2025,
  caOpeningLeanTarget2027,
} from "@/lib/countries/ca/data/caFederalVote2025";

/** Largest allowed move of any region on either lean axis. */
const MAX_REGION_MOVE = 2;

interface RegionRow {
  countryId: string;
  regionId: string;
  move: number;
}

function movesFor(
  countryId: string,
  docs: CensusGroupView[],
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

describe("2027 US opening lean tracks the 2024 presidential result", () => {
  // The 2027 surface once inherited a 2023 surface that put Iowa left of
  // California and the Deep South at the center. Every state must now land on
  // its 2024 margin, on the right side of zero, and keep the national spread.
  const rows = Object.keys(stateCensusData2027).map((stateId) => {
    const lean = censusStateLean({ _id: stateId, countryId: "US" } as unknown as CensusGroupView, {
      countryId: "US",
      stateId,
      preset: "2027-default",
      year: 2027,
      startingYear: 2027,
    });
    return { stateId, lean: lean.economicLean, target: usOpeningLeanTarget2027(stateId) };
  });

  it("every state is within 0.1 of its target (DC within 0.25, it sits on the position floor)", () => {
    const off = rows.filter(
      (r) => r.target === null || Math.abs(r.lean - r.target) > (r.stateId === "DC" ? 0.25 : 0.1)
    );
    expect(off).toEqual([]);
  });

  it("states decided by more than five points lean toward their winner", () => {
    const wrongSide = rows.filter(
      (r) =>
        r.target !== null &&
        Math.abs(r.target / LEAN_PER_MARGIN_POINT) > 5 &&
        Math.sign(r.lean) !== Math.sign(r.target)
    );
    expect(wrongSide).toEqual([]);
  });
});

describe("2027 Canada opening lean tracks the 2025 federal vote", () => {
  it("every province and territory is within 0.05 of its target on both axes", () => {
    const off = Object.keys(CA_FEDERAL_VOTE_2025).flatMap((regionId) => {
      const target = caOpeningLeanTarget2027(regionId)!;
      const lean = censusStateLean(
        { _id: regionId, countryId: "CA" } as unknown as CensusGroupView,
        {
          countryId: "CA",
          stateId: regionId,
          preset: "2027-default",
          year: 2027,
          startingYear: 2027,
        }
      );
      const miss = Math.max(
        Math.abs(lean.economicLean - target.economicLean),
        Math.abs(lean.socialLean - target.socialLean)
      );
      return miss > 0.05 ? [{ regionId, lean, target }] : [];
    });
    expect(off).toEqual([]);
  });
});
