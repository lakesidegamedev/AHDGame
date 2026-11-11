import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getNonPlayableBoards } from "./nonPlayableBoards";
import { nonPlayableBoardsSchema } from "./nonPlayableBoardsSchema";

/** Values read from the TypeScript table before it moved to a data file. */
const SAMPLE: [preset: string, country: string, region: string, family: string, value: number][] = [
  ["1953-default", "AT", "AT_VIE", "economy.fiscal", 55.7],
  ["1953-default", "NG", "SOUTH_WEST", "society.tradition", 31.3],
  ["1953-default", "BAL", "BAL_LVA", "economy.fiscal", 74.4],
  ["1979-default", "AT", "AT_VIE", "defense.armedForces", 10],
  ["1979-default", "YU", "YU_VOJ", "economy.fiscal", 70.8],
  ["1979-default", "BAL", "BAL_LVA", "defense.armedForces", 25],
  ["1991-default", "AT", "AT_VIE", "society.tradition", 76],
  ["1991-default", "NG", "SOUTH_WEST", "economy.fiscal", 16.7],
  ["1991-default", "YU", "YU_VOJ", "defense.armedForces", 68],
  ["1991-default", "BAL", "BAL_LVA", "society.tradition", 72.5],
  ["2019-default", "NG", "SOUTH_WEST", "defense.armedForces", 15],
  ["2019-default", "YU", "YU_VOJ", "society.tradition", 73.6],
];

const REGION_COUNTS_2019: Record<string, number> = {
  AT: 5,
  BAL: 3,
  BG: 5,
  BLR: 6,
  BR: 5,
  CS: 4,
  ES: 8,
  FI: 6,
  FR: 8,
  GR: 6,
  HU: 6,
  IE: 8,
  IT: 8,
  NG: 6,
  PL: 8,
  RO: 7,
  SE: 8,
  TR: 8,
  UKR: 6,
  YU: 8,
};

describe("non-playable boards data file", () => {
  it("returns the values the TypeScript table held", () => {
    const boards = getNonPlayableBoards();
    for (const [preset, country, region, family, value] of SAMPLE) {
      expect(
        (boards[preset]?.[country]?.[region] as Record<string, number> | undefined)?.[family],
        `${preset}/${country}/${region} ${family}`
      ).toBe(value);
    }
    const regions = Object.fromEntries(
      Object.entries(boards["2019-default"]).map(([country, byRegion]) => [
        country,
        Object.keys(byRegion).length,
      ])
    );
    expect(regions).toEqual(REGION_COUNTS_2019);
  });

  it("matches the TypeScript table byte for byte once serialised", () => {
    const digest = createHash("sha256")
      .update(JSON.stringify(getNonPlayableBoards()))
      .digest("hex");
    expect(digest).toBe("cb5e72cfebcd35e7b8a96ffff3d100d50bca142c008d8b0d7459e676c2559de8");
  });

  it("loads once and serves the cached table", () => {
    expect(getNonPlayableBoards()).toBe(getNonPlayableBoards());
  });

  it("passes its schema", () => {
    expect(nonPlayableBoardsSchema.safeParse(getNonPlayableBoards()).success).toBe(true);
  });
});
