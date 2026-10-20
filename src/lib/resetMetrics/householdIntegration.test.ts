import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { collectResetMetricOwnerReadings } from "./collectOwnerReadings";
import { householdFixture } from "./testing/householdFixture";
import {
  aggregateNationalMetricValue,
  aggregateNationalMetricHistory,
} from "./rules/nationalAggregation";
import { refreshResetMetricBoard } from "./rules/refresh";
import { appendMetricHistory } from "./rules/history";
import { ownedLegacyValues } from "./rules/ownedInputs";

describe("household production owner integration", () => {
  function setup(country: "US" | "UK" | "JP" = "UK", paid = 48) {
    const fixture = householdFixture(country, 2, paid);
    const db = createMockDb();
    db.collection("resetLawPrograms").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: "cash-law",
          worldId: "test-world",
          country,
          scope: "national",
          familyId: "L01",
          fundingAccountId: "account",
          effectiveTurn: 1,
          primaryMetricEffects: [],
        },
      ]),
    });
    db.collection("resetDepartmentAccounts").find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          _id: "account",
          countryId: country,
          accruedThroughTurn: 2,
          lastProgramDelivery: {
            L01: { outlaid: (2 * paid) / 48, implementationFactor: paid > 0 ? 1 : 0 },
          },
        },
      ]),
    });
    return { ...fixture, db };
  }
  it.each(["US", "UK", "JP"] as const)(
    "publishes one funded household definition for %s without duplicate law reads",
    async (country) => {
      const f = setup(country);
      const result = await collectResetMetricOwnerReadings(
        f.db as unknown as Db,
        [f.national, ...f.regions],
        2
      );
      for (const b of f.regions) {
        const updates = result[b._id]!.updates;
        expect(updates["02"]!.definitionVersion).toBe(2);
        expect(updates["02"]!.value).toBe(100);
        expect(updates["03"]!.value).toBe(0);
        expect(updates["03"]!.observedAtTurn).toBe(2);
        expect(updates["04"]!.countryBasis!.value).toBeGreaterThan(0);
      }
      expect(f.db.collection("resetLawPrograms").find).toHaveBeenCalledTimes(1);
    }
  );
  it("does not promote a source whose claimed household cash was not paid", async () => {
    const f = setup();
    f.db
      .collection("resetDepartmentAccounts")
      .find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
    const result = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...f.regions],
      2
    );
    expect(result[f.regions[0]!._id]!.updates["02"]?.definitionVersion).toBeUndefined();
  });
  it("does not reuse an old benefit classification after the same law id changes option", async () => {
    const f = setup();
    f.source.programRoles = f.source.programRoles.map((r) => ({ ...r, choice: "outdated-option" }));
    const result = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...f.regions],
      2
    );
    expect(result[f.regions[0]!._id]!.updates["02"]?.definitionVersion).toBeUndefined();
  });
  it("existing laws with zero actual outlays remove household relief", async () => {
    const f = setup("UK", 0);
    const result = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...f.regions],
      2
    );
    expect(result[f.regions[0]!._id]!.updates["03"]!.value).toBe(25);
  });
  it("preserves the adopted definition and measurement date if later source data is missing", async () => {
    const f = setup();
    const first = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...f.regions],
      2
    );
    const advanced = f.regions.map(
      (board) => refreshResetMetricBoard({ board, turn: 2, ...first[board._id]! }).board
    );
    const next = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...advanced],
      3
    );
    expect(next[advanced[0]!._id]!.updates["02"]!.value).toBe(100);
    expect(next[advanced[0]!._id]!.updates["02"]!.definitionVersion).toBe(2);
    expect(next[advanced[0]!._id]!.updates["02"]!.observedAtTurn).toBe(2);
  });
  it("uses compact country results for national and historical aggregation, not current weights", async () => {
    const f = setup();
    const first = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...f.regions],
      2
    );
    const readings = f.regions.map((board) => {
      const advanced = refreshResetMetricBoard({ board, turn: 2, ...first[board._id]! }).board;
      return {
        regionId: board.regionId!,
        population: 999999,
        observations: advanced.observations,
        history: appendMetricHistory(board.history!, advanced.observations, 2),
      };
    });
    expect(aggregateNationalMetricValue("03", readings)).toBe(0);
    const samples = aggregateNationalMetricHistory("02", readings);
    expect(samples[1]!.value).toBe(100);
    expect(samples[1]!.definitionVersion).toBe(2);
    expect(samples[0]!.definitionVersion).toBeUndefined();
    const laterReadings = readings.map((reading) => ({
      ...reading,
      observations: Object.fromEntries(
        Object.entries(reading.observations).map(([id, o]) => [
          id,
          o.definitionVersion === 2
            ? {
                ...o,
                observedAtTurn: 3,
                countryBasis: { ...o.countryBasis!, measurementTurn: 3 },
              }
            : o,
        ])
      ),
    }));
    // Viewing the chart after a later measurement must still use turn 2's basis.
    expect(aggregateNationalMetricHistory("02", laterReadings)).toEqual(samples);
    const futureReadings = laterReadings.map((reading) => ({
      ...reading,
      history: {
        ...reading.history,
        "02": reading.history["02"]!.map((point) =>
          point.countryBasis
            ? {
                ...point,
                countryBasis: { ...point.countryBasis, measurementTurn: point.turn + 1 },
              }
            : point
        ),
      },
    }));
    expect(() => aggregateNationalMetricHistory("02", futureReadings)).toThrow(
      "future measurement"
    );
    expect(
      ownedLegacyValues(readings[0]!.observations)["economic.realPurchasingPower"]
    ).toBeUndefined();
  });
  it("rejects losing source coverage after only half a country migrated", async () => {
    const f = setup();
    const first = await collectResetMetricOwnerReadings(
      f.db as unknown as Db,
      [f.national, ...f.regions],
      2
    );
    const committed = refreshResetMetricBoard({
      board: f.regions[0]!,
      turn: 2,
      ...first[f.regions[0]!._id]!,
    }).board;
    f.source.coverage.references.composition = undefined;
    await expect(
      collectResetMetricOwnerReadings(
        f.db as unknown as Db,
        [f.national, committed, f.regions[1]!],
        2
      )
    ).rejects.toThrow("partial country");
  });
});
