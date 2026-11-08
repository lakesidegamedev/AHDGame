import type { CountryElections } from "../contract";
import type { CountryElectionPhaseEntry } from "@/lib/turn/countryPhases";
import {
  easternBlocElectionsLive,
  ensureEasternBlocAssemblyElections,
  ensureRegionalDelegateElections,
  seatsFromRegionField,
} from "@/lib/turn/perpetualElections/shared";

/** Poland Sejm, using the regional delegate pattern in both eras. */
export async function ensurePLElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureEasternBlocAssemblyElections("PL", "sejm", "Sejm", now, inFlightTurn);
}

/** Poland's restored Senate, elected with the Sejm using region seat totals. */
export async function ensurePLSenateElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureRegionalDelegateElections(
    {
      countryId: "PL",
      electionType: "senat",
      seatsForRegions: (regions) => seatsFromRegionField(regions, "stateSenateSeats"),
      openPrimaryImmediately: true,
      statusGated: true,
      electionsLiveGate: easternBlocElectionsLive,
      label: "Senate",
    },
    now,
    inFlightTurn
  );
}

/**
 * Poland's elections. Server only: spawners reach `getDb`.
 *
 * No `spawn`: Poland is absent from `SPAWN_ELECTIONS_REGISTRY`; phases
 * run via `COUNTRY_ELECTION_PHASES`. Adding `spawn` would double-run them.
 *
 * No `seats`: apportionment reads from live regions like East Germany
 * and Brazil; empty `byChamber` would misdescribe a seatless chamber.
 */
const phases: CountryElectionPhaseEntry[] = [
  { name: "plSejmElections", fn: ensurePLElections },
  { name: "plSenateElections", fn: ensurePLSenateElections },
];

export const PL_ELECTIONS: CountryElections = {
  electionPhases: phases,
};
