import { describe, expect, it } from "vitest";
import { buildOpeningMetricSnapshots1991 } from "../seedOpening1991";
import {
  compatibleConditionChange,
  GAMEPLAY_METRIC_DRIVERS,
  gameplayMetricPressure,
} from "./gameplayDrivers";
import { dueResetMetricIds, refreshResetMetricBoard } from "./refresh";
import { primaryMetricById } from "../catalog";

const boards = buildOpeningMetricSnapshots1991("drivers", 1);
describe("gameplay-driven modeled outcomes", () => {
  it.each(["US", "UK", "JP"] as const)(
    "responds to jobs and hardship in %s without survey inputs",
    (country) => {
      const board = structuredClone(
        boards.find((b) => b.countryId === country && b.scope === "regional")!
      );
      expect(gameplayMetricPressure(board, 1991)).toEqual({});
      board.observations["01"]!.value = 0.5;
      board.observations["03"]!.value = 0.5;
      const result = gameplayMetricPressure(board, 1991);
      expect(result["31"]).toBeGreaterThan(0);
      expect(result["32"]).toBeGreaterThan(0);
      expect(result["11"]).toBeGreaterThan(0);
      expect(result["40"]).toBeGreaterThan(0);
      expect(result["50"]).toBeUndefined();
    }
  );
  it("keeps legal outcomes, measured owners and event counts out of economic bonus paths", () => {
    for (const id of [
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "20",
      "24",
      "25",
      "33",
      "39",
      "45",
      "49",
      "50",
      "51",
      "54",
      "55",
      "56",
      "57",
      "58",
    ])
      expect(GAMEPLAY_METRIC_DRIVERS[id]).toBeUndefined();
    for (const [id, drivers] of Object.entries(GAMEPLAY_METRIC_DRIVERS)) {
      expect(primaryMetricById(id)).toBeDefined();
      expect(drivers.reduce((n, [, w]) => n + Math.abs(w), 0)).toBeLessThanOrEqual(0.5);
      for (const [source] of drivers) {
        expect(source).not.toBe(id);
        expect(primaryMetricById(source)).toBeDefined();
      }
    }
  });
  it("never compares new household units with old opening indexes", () => {
    const b = structuredClone(boards.find((b) => b._id === "UK:LON")!);
    b.observations["24"] = {
      ...b.observations["24"]!,
      value: 0.3,
      unit: "payment/income",
      definitionVersion: 2,
    };
    expect(compatibleConditionChange(b, "24", "UK", 1991)).toBeNull();
    b.gameplayReferences = { "24": { value: 0.4, unit: "payment/income", definitionVersion: 2 } };
    expect(compatibleConditionChange(b, "24", "UK", 1991)).toBeCloseTo(25);
    b.gameplayReferences["24"]!.unit = "old index";
    expect(compatibleConditionChange(b, "24", "UK", 1991)).toBeNull();
  });
  it("pins new-unit baselines independently of sampled history and preserves retries", () => {
    const b = structuredClone(boards.find((b) => b._id === "UK:LON")!);
    const o = {
      ...b.observations["24"]!,
      value: 0.4,
      unit: "payment/income",
      definitionVersion: 2 as const,
    };
    const first = refreshResetMetricBoard({
      board: b,
      turn: 2,
      cohortDue: false,
      electionDue: false,
      updates: {
        ...Object.fromEntries(
          dueResetMetricIds(b, 2, false, false).map((id) => [id, b.observations[id]!])
        ),
        "24": o,
      },
    }).board;
    expect(first.gameplayReferences?.["24"]?.value).toBe(0.4);
    const second = refreshResetMetricBoard({
      board: first,
      turn: 3,
      cohortDue: false,
      electionDue: false,
      updates: {
        ...Object.fromEntries(
          dueResetMetricIds(first, 3, false, false).map((id) => [id, first.observations[id]!])
        ),
        "24": { ...o, value: 0.3 },
      },
    }).board;
    expect(second.gameplayReferences?.["24"]?.value).toBe(0.4);
    expect(compatibleConditionChange(second, "24", "UK", 1991)).toBeCloseTo(25);
    expect(
      refreshResetMetricBoard({
        board: second,
        turn: 3,
        cohortDue: false,
        electionDue: false,
        updates: Object.fromEntries(
          dueResetMetricIds(second, 3, false, false).map((id) => [id, second.observations[id]!])
        ),
      }).replayed
    ).toBe(true);
  });
});
