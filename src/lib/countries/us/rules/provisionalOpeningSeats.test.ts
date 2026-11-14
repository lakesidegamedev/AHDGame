import { describe, expect, it } from "vitest";
import snapshot from "../data/us2026ResultsSnapshot.json";
import { states2027 } from "../data/usStates2027";
import { US_GOVERNORS_2027, US_STATE_SENATE_2027 } from "../data/usStateOffices2027";
import { US_SENATE_2027 } from "../data/usSenate2027";
import { provisionalStateSenates } from "./provisionalOpeningSeats";

describe("provisional 2026 results for the modeled 2027 opening", () => {
  it("covers every voting district once and preserves pending-count provenance", () => {
    expect(new Set(snapshot.house.map((r) => r.district)).size).toBe(435);
    expect(snapshot.house.every((r) => !!r.basis)).toBe(true);
    expect(snapshot.status).toBe("provisional-game-opening-not-certified");
    expect(snapshot.senate.find((r) => r.state === "AK")?.basis).toBe(
      "modeled-incumbent-hold-pending-count"
    );
    expect(US_SENATE_2027.find((r) => r.state === "AK" && r.senateClass === 2)?.party).toBe(
      "republican"
    );
    expect(US_SENATE_2027.find((r) => r.state === "TX" && r.senateClass === 2)?.party).toBe(
      "democrat"
    );
  });
  it("replaces 2020 state allocations while retaining explicit fallback coverage", () => {
    expect(US_GOVERNORS_2027).toHaveLength(50);
    expect(US_GOVERNORS_2027.find((r) => r.state === "TX")?.party).toBe("democrat");
    expect(US_STATE_SENATE_2027.reduce((n, r) => n + (r.seatsHeld ?? 1), 0)).toBe(1973);
    for (const state of states2027.filter((s) => s._id !== "DC"))
      expect(
        US_STATE_SENATE_2027.filter((r) => r.state === state._id).reduce(
          (n, r) => n + (r.seatsHeld ?? 1),
          0
        ),
        state._id
      ).toBe(state.stateSenateSeats);
    expect(snapshot.stateSenates.some((r) => r.basis.startsWith("modeled-prior"))).toBe(true);
  });
  it("conserves a modeled chamber with a missing seat instead of dropping it", () => {
    const rows = provisionalStateSenates([{ state: "XX", seats: 5, counts: { D: 1, R: 3 } }]);
    expect(rows.map((r) => r.seatsHeld)).toEqual([1, 4]);
  });
});
