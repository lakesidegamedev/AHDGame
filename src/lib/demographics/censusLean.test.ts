import { describe, expect, it } from "vitest";
import type { State, StateDemographics } from "@/lib/db/types";
import { computeLeanMap } from "@/lib/map/leanService";
import { censusStateLean } from "./censusLean";

const demographics = (id: string): StateDemographics => ({
  _id: id,
  countryId: "IE",
  categoryWeights: {},
  groups: {},
  lastUpdated: new Date(0),
});

describe("censusStateLean", () => {
  it("reads a finite lean from the region's census cells", () => {
    const lean = censusStateLean(demographics("DUB"), {
      countryId: "IE",
      stateId: "DUB",
      preset: "2019-default",
    });
    expect(Number.isFinite(lean.economicLean)).toBe(true);
    expect(Number.isFinite(lean.socialLean)).toBe(true);
    expect(Math.abs(lean.economicLean)).toBeLessThanOrEqual(5);
    expect(Math.abs(lean.socialLean)).toBeLessThanOrEqual(5);
  });

  it("errors when the region has no census", () => {
    expect(() =>
      censusStateLean(demographics("NOWHERE"), {
        countryId: "IE",
        stateId: "NOWHERE",
        preset: "2019-default",
      })
    ).toThrow("No census electorate for IE region NOWHERE");
  });
});

describe("computeLeanMap", () => {
  const dbWith = (states: Partial<State>[], docs: StateDemographics[]) =>
    ({
      collection: (name: string) => ({
        find: () => ({ toArray: async () => (name === "states" ? states : docs) }),
        findOne: async () => ({ preset: "2019-default" }),
      }),
    }) as unknown as import("mongodb").Db;

  it("prefers the cached lean", async () => {
    const map = await computeLeanMap(
      dbWith([{ _id: "DUB", name: "Dublin", cachedEconomicLean: 1.5, cachedSocialLean: -0.5 }], []),
      "IE"
    );
    expect(map.DUB.economicLean).toBe(1.5);
    expect(map.DUB.socialLean).toBe(-0.5);
  });

  it("falls back to the census lean, and errors with neither", async () => {
    const census = await computeLeanMap(
      dbWith([{ _id: "DUB", name: "Dublin" }], [demographics("DUB")]),
      "IE"
    );
    expect(Number.isFinite(census.DUB.economicLean)).toBe(true);
    await expect(
      computeLeanMap(dbWith([{ _id: "DUB", name: "Dublin" }], []), "IE")
    ).rejects.toThrow("No census electorate for IE region DUB");
  });
});
