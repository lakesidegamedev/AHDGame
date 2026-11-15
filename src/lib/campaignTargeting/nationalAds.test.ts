import { expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { loadRegionalCampaignCells } from "./audience";
import { planAdPurchase, targetedAdBonuses, meanAdBonus } from "./rules";
import type { State } from "@/lib/db/types";
const makeState = (
  values: Pick<State, "_id" | "countryId" | "population" | "votingEligiblePopulation">
): State => ({
  name: values._id,
  gdp: 0,
  houseDistricts: 0,
  stateSenateSeats: 0,
  region: "Synthetic",
  ...values,
});

it("combines regional audiences without giving a national ad buy free geographic coverage", async () => {
  const db = createMockDb();
  const regions = [
    makeState({
      _id: "DUB",
      countryId: "IE",
      population: 1_000_000,
      votingEligiblePopulation: 1_000_000,
    }),
    makeState({
      _id: "COR",
      countryId: "IE",
      population: 2_000_000,
      votingEligiblePopulation: 2_000_000,
    }),
  ];
  db.collection("states").find.mockReturnValue({ toArray: async () => regions });
  db.collection("stateDemographics").find.mockReturnValue({
    toArray: async () =>
      regions.map((state) => ({
        _id: state._id,
        countryId: "IE",
        groups: {},
        categoryWeights: {},
        lastUpdated: new Date(0),
      })),
  });
  db.collection("gameState").findOne.mockResolvedValue({
    _id: "current",
    preset: "2019-default",
    currentTurn: 10,
  });
  const loaded = await loadRegionalCampaignCells(db as unknown as Db, regions, new Set(["IE:IE"]));
  const cells = loaded.get("IE:IE:0")!;
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.reduce((sum, cell) => sum + cell.share, 0)).toBeCloseTo(1);
  expect(
    cells.filter((cell) => cell.stateId === "DUB").reduce((sum, cell) => sum + cell.share, 0)
  ).toBeCloseTo(1 / 3);
  const [dimension, bucket] = Object.entries(
    cells.find((cell) => cell.stateId === "DUB")!.buckets
  )[0];
  const ads = planAdPurchase([], { stateId: "DUB", dimension, bucket }, 10, 1)!;
  const position = { economicLean: 0, socialLean: 0 };
  const bonuses = targetedAdBonuses(cells, position, ads, "IE", 10);
  expect(
    cells.filter((cell) => cell.stateId === "COR").every((cell) => bonuses[cell.id] === 0)
  ).toBe(true);
  expect(meanAdBonus(cells, bonuses)).toBeGreaterThan(0);
});
