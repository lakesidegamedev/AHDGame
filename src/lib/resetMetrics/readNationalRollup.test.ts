import { buildSuccessorMetricRows } from "@/lib/referendum/secede/rules/resetV2Promotion";
import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { states1991 } from "@/lib/countries/us/data/usStates1991";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { buildOpeningMetricSnapshots1991 } from "./seedOpening1991";
import { readNationalMetricRollup } from "./readNationalRollup";

describe("national v2 metric rollup reader", () => {
  it.each(["SCO", "WAL"] as const)(
    "reads inherited %s timestamps without waiting for a new turn",
    async (countryId) => {
      const db = createMockDb();
      const opening = buildOpeningMetricSnapshots1991("converted", 1);
      const aggregate = structuredClone(opening.find((b) => b._id === `UK:${countryId}`)!);
      aggregate.asOfTurn = 817;
      for (const row of Object.values(aggregate.observations)) row.lastUpdatedTurn = 817;
      const converted = buildSuccessorMetricRows({
        countryId,
        aggregate,
        national: opening.find((b) => b._id === "UK:national")!,
        turn: 818,
        regions: [{ id: "test", population: 100 }],
      });
      const regional = converted[1];
      for (const row of Object.values(regional.observations)) row.lastUpdatedTurn = 817;
      db.collection("resetMetricSnapshots").find.mockReturnValue({
        toArray: async () => [regional],
      });
      db.collection("states").find.mockReturnValue({
        toArray: async () => [
          {
            _id: "test",
            countryId,
            population: 100,
            workingAgePopulation: 60,
            votingEligiblePopulation: 70,
            gdp: 1000,
          },
        ],
      });
      const readings = await readNationalMetricRollup(db as unknown as Db, converted[0]);
      expect(Object.keys(readings ?? {})).toHaveLength(58);
      expect(regional.observations["01"].lastUpdatedTurn).toBe(817);
    }
  );

  it("combines five sovereign observations with 53 validated regional rollups", async () => {
    const db = createMockDb();
    const boards = buildOpeningMetricSnapshots1991("world-test", 1);
    const national = boards.find((board) => board._id === "US:national")!;
    const regional = boards.filter(
      (board) => board.countryId === "US" && board.scope === "regional"
    );
    db.collection("resetMetricSnapshots").find.mockReturnValue({
      toArray: async () => regional,
    });
    db.collection("states").find.mockReturnValue({ toArray: async () => states1991 });

    const observations = await readNationalMetricRollup(db as unknown as Db, national);
    expect(Object.keys(observations ?? {})).toHaveLength(58);
    expect(observations?.["07"]).toEqual(national.observations["07"]);
    expect(observations?.["01"]?.source).toContain("national rollup");
  });

  it("fails closed when a regional board is missing", async () => {
    const db = createMockDb();
    const boards = buildOpeningMetricSnapshots1991("world-test", 1);
    const national = boards.find((board) => board._id === "US:national")!;
    const regional = boards.filter(
      (board) => board.countryId === "US" && board.scope === "regional"
    );
    db.collection("resetMetricSnapshots").find.mockReturnValue({
      toArray: async () => regional.slice(1),
    });
    db.collection("states").find.mockReturnValue({ toArray: async () => states1991 });
    expect(await readNationalMetricRollup(db as unknown as Db, national)).toBeNull();
  });
});
