import { expect, it } from "vitest";
import snapshot from "./us2026ResultsSnapshot.json";
import { US_HOUSE_2027 } from "./usHouse2027";
import { US_SENATE_2027 } from "./usSenate2027";
import { US_SENATE_BASE_2027 } from "./usSenateBase2027";
import { US_GOVERNORS_2027, US_STATE_SENATE_2027 } from "./usStateOffices2027";
import {
  openingParty,
  provisionalHouseSeats,
  provisionalSenateSeats,
  provisionalStateSenates,
} from "../rules/provisionalOpeningSeats";

it("keeps client-safe seat projections aligned with the dated provisional source", () => {
  expect(US_HOUSE_2027).toEqual(provisionalHouseSeats(snapshot.house));
  expect(US_SENATE_2027).toEqual(provisionalSenateSeats(US_SENATE_BASE_2027, snapshot.senate));
  expect(US_GOVERNORS_2027).toEqual(
    snapshot.governors.map((row) => ({
      state: row.state,
      officeType: "governor",
      party: openingParty(row.party),
    }))
  );
  expect(US_STATE_SENATE_2027).toEqual(provisionalStateSenates(snapshot.stateSenates));
});
