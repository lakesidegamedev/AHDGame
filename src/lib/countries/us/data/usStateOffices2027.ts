/** Dated provisional state offices; incomplete counts remain labeled modeled baselines. */
import type { HistoricalSeat } from "@/lib/constants/historicalSeats";
import snapshot from "./us2026ResultsSnapshot.json";
import { openingParty, provisionalStateSenates } from "../rules/provisionalOpeningSeats";

export const US_GOVERNORS_2027: HistoricalSeat[] = snapshot.governors.map((row) => ({
  state: row.state,
  officeType: "governor",
  party: openingParty(row.party),
}));
export const US_STATE_SENATE_2027 = provisionalStateSenates(snapshot.stateSenates);
