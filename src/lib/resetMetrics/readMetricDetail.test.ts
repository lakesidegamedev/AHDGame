import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { states1991 } from "@/lib/countries/us/data/usStates1991";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { readResetMetricDetail } from "./readMetricDetail";
import { buildOpeningMetricSnapshots1991 } from "./seedOpening1991";
import { householdFixture } from "./testing/householdFixture";
import { regionalCoverageKey } from "./rules/householdPublication";

describe("v2 metric detail read", () => {
  it("does not chart older gross-income history as a disposable-income series", async () => {
    const db = createMockDb();
    const f = householdFixture();
    const countryBasis = {
      countryId: "UK",
      coverageKey: regionalCoverageKey(f.regions.map((b) => b.regionId!)),
      measurementTurn: 2,
      value: 100,
    };
    const regional = f.regions.map((board) => ({
      ...board,
      asOfTurn: 2,
      observations: {
        ...board.observations,
        "02": {
          ...board.observations["02"]!,
          definitionVersion: 2 as const,
          unit: "annual real equivalised disposable income",
          observedAtTurn: 2,
          countryBasis,
          value: 100,
        },
      },
      history: {
        ...board.history,
        "02": [
          ...board.history!["02"]!,
          {
            turn: 2,
            value: 100,
            definitionVersion: 2 as const,
            unit: "annual real equivalised disposable income",
            countryBasis,
          },
        ],
      },
    }));
    db.collection("resetMetricSnapshots").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(regional),
    });
    db.collection("states").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(
        f.regions.map((b) => ({
          _id: b.regionId,
          countryId: "UK",
          name: "Fixture region",
          population: 4,
        }))
      ),
    });
    const result = await readResetMetricDetail(
      db as unknown as Db,
      { ...f.national, asOfTurn: 2 },
      "02"
    );
    expect(result!.history).toHaveLength(1);
    expect(result!.history[0]!.definitionVersion).toBe(2);
    expect(regional[0]!.history["02"]![0]!.turn).toBe(1);
    expect(regional[0]!.history["02"]).toHaveLength(2);
  });
  it("returns aligned history and every regional owner for a region-owned metric", async () => {
    const db = createMockDb();
    const boards = buildOpeningMetricSnapshots1991("world-detail", 1);
    const national = boards.find((board) => board._id === "US:national")!;
    const regional = boards.filter(
      (board) => board.countryId === "US" && board.scope === "regional"
    );
    db.collection("resetMetricSnapshots").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(regional),
    });
    db.collection("states").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(states1991),
    });

    const result = await readResetMetricDetail(db as unknown as Db, national, "02");
    expect(result?.regions).toHaveLength(states1991.length);
    expect(result?.history).toHaveLength(1);
    expect(result?.history[0]?.value).toBe(result?.nationalValue);
    expect(result?.regions.some((region) => region.name === "Pennsylvania")).toBe(true);
  });

  it("returns the selected region's own history on a regional metric page", async () => {
    const db = createMockDb();
    const boards = buildOpeningMetricSnapshots1991("world-detail", 1);
    const regional = boards.filter(
      (board) => board.countryId === "US" && board.scope === "regional"
    );
    const pennsylvania = regional.find((board) => board.regionId === "PA")!;
    db.collection("resetMetricSnapshots").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(regional),
    });
    db.collection("states").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(states1991),
    });

    const result = await readResetMetricDetail(db as unknown as Db, pennsylvania, "02");

    expect(result?.history).toEqual(pennsylvania.history?.["02"]);
    expect(result?.history[0]?.value).toBe(pennsylvania.observations["02"]?.value);
    expect(result?.history[0]?.value).not.toBe(result?.nationalValue);
  });

  it("uses the national owner series for a national-only metric", async () => {
    const db = createMockDb();
    const national = buildOpeningMetricSnapshots1991("world-detail", 1).find(
      (board) => board._id === "US:national"
    )!;
    db.collection("resetMetricSnapshots").findOne.mockResolvedValue(national);
    const result = await readResetMetricDetail(db as unknown as Db, national, "07");
    expect(result).toEqual({
      history: [{ turn: 1, value: national.observations["07"]!.value }],
      nationalValue: national.observations["07"]!.value,
      regions: [],
    });
  });
});
