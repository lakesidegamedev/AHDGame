import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import {
  easternBlocElectionsLive,
  ensureEasternBlocAssemblyElections,
  ensureRegionalDelegateElections,
  seatsFromRegionField,
} from "@/lib/turn/perpetualElections/shared";

/** Czechoslovakia Chamber of the People. */
export async function ensureCSElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureEasternBlocAssemblyElections(
    "CS",
    "chamberOfThePeople",
    "Chamber of the People",
    now,
    inFlightTurn
  );
}

/** The 1991 federal Chamber of Nations, apportioned 75/75 by republic. */
export async function ensureCSNationsElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureRegionalDelegateElections(
    {
      countryId: "CS",
      electionType: "chamberOfNations",
      seatsForRegions: (regions) => seatsFromRegionField(regions, "stateSenateSeats"),
      openPrimaryImmediately: true,
      statusGated: true,
      electionsLiveGate: easternBlocElectionsLive,
      label: "Chamber of Nations",
    },
    now,
    inFlightTurn
  );
}

/**
 * Czechoslovakia's elections.
 *
 * SERVER ONLY. The spawners reach `getDb`.
 *
 * NO `spawn`: CS has no `SPAWN_ELECTIONS_REGISTRY` row; phases run via
 * `COUNTRY_ELECTION_PHASES`. Adding `spawn` would double-run them each turn.
 * CS spawners live here and use shared helpers.
 *
 * NO `seats`: no seat table exists for CS; apportionment reads live regions.
 * An empty `byChamber` would describe a chamber with no seats.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "csChamberOfThePeopleElections", fn: ensureCSElections },
  { name: "csChamberOfNationsElections", fn: ensureCSNationsElections },
];

export const CS_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
