import { describe, expect, it } from "vitest";
import {
  getPresetSeats,
  US_EXECUTIVE_2027,
  US_GOVERNORS_2020,
  US_STATE_SENATE_2020,
  type HistoricalSeat,
} from "./historicalSeats";
import { seatsForCountry } from "./presetSeatGroups";
import { states2027 } from "@/lib/seeds/reference/states2027";
import { US_CONGRESS_RESULT_2027 } from "@/lib/countries/us/data/usCongressResult2027";
import {
  US_GOVERNORS_2027,
  US_STATE_SENATE_2027,
} from "@/lib/countries/us/data/usStateOffices2027";

const STATES = states2027.filter((entry) => entry._id !== "DC");
const held = (rows: HistoricalSeat[]) => rows.reduce((sum, seat) => sum + (seat.seatsHeld ?? 1), 0);

describe("2027 US roster from the November 2026 results", () => {
  const seats = seatsForCountry("2027-default", "US");
  const ofType = (type: HistoricalSeat["officeType"]) =>
    seats.filter((seat) => seat.officeType === type);

  it("uses an explicit roster instead of the 2019 fallback", () => {
    expect(seats).not.toEqual(seatsForCountry("2019-default", "US"));
    expect(getPresetSeats("2027-default")).toEqual(expect.arrayContaining(seats));
    expect(seats.some((seat) => seat.officeType === "house")).toBe(true);
    expect(seats.some((seat) => seat.officeType === "senate")).toBe(true);
  });

  it("seats 435 House members matching the called result", () => {
    const house = ofType("house");
    expect(held(house)).toBe(435);
    expect(held(house.filter((seat) => seat.party === "democrat"))).toBe(
      US_CONGRESS_RESULT_2027.house.democrat
    );
    expect(held(house.filter((seat) => seat.party === "republican"))).toBe(
      US_CONGRESS_RESULT_2027.house.republican
    );
  });

  it("fills every state's House apportionment", () => {
    for (const state of STATES) {
      const total = held(
        seats.filter((seat) => seat.officeType === "house" && seat.state === state._id)
      );
      expect(total, state._id).toBe(state.houseDistricts);
    }
  });

  it("seats 100 senators, two per state with distinct classes", () => {
    const senate = ofType("senate");
    expect(senate).toHaveLength(100);
    for (const state of STATES) {
      const rows = senate.filter((seat) => seat.state === state._id);
      expect(rows, state._id).toHaveLength(2);
      expect(new Set(rows.map((seat) => seat.senateClass)).size, state._id).toBe(2);
    }
    const republicans = senate.filter((seat) => seat.party === "republican").length;
    expect(republicans).toBe(US_CONGRESS_RESULT_2027.senate.republican);
    expect(100 - republicans).toBe(US_CONGRESS_RESULT_2027.senate.democraticAligned);
  });

  it("seats 50 governors, one per state, from the 2026 results", () => {
    const governors = ofType("governor");
    expect(governors).toEqual(US_GOVERNORS_2027);
    expect(governors).toHaveLength(50);
    expect(new Set(governors.map((seat) => seat.state))).toEqual(
      new Set(STATES.map((state) => state._id))
    );
  });

  it("fills every state senate and preserves Nebraska's nonpartisan allocation", () => {
    const stateSenate = ofType("stateSenate");
    expect(stateSenate).toEqual(US_STATE_SENATE_2027);
    for (const state of STATES) {
      const total = held(stateSenate.filter((seat) => seat.state === state._id));
      expect(total, state._id).toBe(state.stateSenateSeats);
    }
    expect(stateSenate.filter((seat) => seat.state === "NE")).toEqual([
      { state: "NE", officeType: "stateSenate", party: "independent", seatsHeld: 49 },
    ]);
  });

  it("keeps the 2027 executive as authored", () => {
    expect(seats.filter((seat) => seat.state === "US")).toEqual(US_EXECUTIVE_2027);
  });

  it("carries party allocations only, never a named office holder", () => {
    const allowed = new Set(["state", "officeType", "party", "seatsHeld", "senateClass"]);
    for (const seat of seats) {
      for (const key of Object.keys(seat)) expect(allowed.has(key), key).toBe(true);
      expect(["democrat", "republican", "independent"]).toContain(seat.party);
    }
  });

  it("leaves the 2019 sub-national rosters on the 2020 data", () => {
    const seats2019 = seatsForCountry("2019-default", "US");
    expect(seats2019.filter((seat) => seat.officeType === "governor")).toEqual(US_GOVERNORS_2020);
    expect(seats2019.filter((seat) => seat.officeType === "stateSenate")).toEqual(
      US_STATE_SENATE_2020
    );
  });
});
