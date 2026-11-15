import type { HistoricalSeat } from "@/lib/seats/historicalSeat";

/**
 * Party slugs as literals, like every other country's historical seat table:
 * the seat tables are reachable from client code, so this file stays free of
 * runtime imports. The test checks each slug against the Canadian roster.
 */
const PARTY = {
  federalUnity: "ca_federal_unity",
  nationalProsperity: "ca_national_prosperity",
  labourCommons: "ca_labour_commons",
  laurentian: "ca_laurentian",
  greenHorizon: "ca_green_horizon",
} as const;

/**
 * Seats won at the April 2025 federal general election, by province and
 * territory, mapped onto the fictional analogues. One seated bloc per region
 * and party, holding all of that party's seats there.
 * Source: Elections Canada, 45th general election official voting results,
 * table 7 (distribution of seats by political affiliation).
 * https://elections.ca/res/rep/off/ovrGE45/62/table7E.html
 */
type SeatsByParty = Readonly<Partial<Record<keyof typeof PARTY, number>>>;

const SEATS_2025: Readonly<Record<string, SeatsByParty>> = {
  CA_NL: { federalUnity: 4, nationalProsperity: 3 },
  CA_PE: { federalUnity: 4 },
  CA_NS: { federalUnity: 10, nationalProsperity: 1 },
  CA_NB: { federalUnity: 6, nationalProsperity: 4 },
  CA_QC: { federalUnity: 44, nationalProsperity: 11, laurentian: 22, labourCommons: 1 },
  CA_ON: { federalUnity: 70, nationalProsperity: 52 },
  CA_MB: { federalUnity: 6, nationalProsperity: 7, labourCommons: 1 },
  CA_SK: { federalUnity: 1, nationalProsperity: 13 },
  CA_AB: { federalUnity: 2, nationalProsperity: 34, labourCommons: 1 },
  CA_BC: { federalUnity: 20, nationalProsperity: 19, labourCommons: 3, greenHorizon: 1 },
  CA_YT: { federalUnity: 1 },
  CA_NT: { federalUnity: 1 },
  CA_NU: { labourCommons: 1 },
};

export const CA_COMMONS_2027: HistoricalSeat[] = Object.entries(SEATS_2025).flatMap(
  ([state, byParty]) =>
    Object.entries(byParty).map(([party, seatsHeld]) => ({
      state,
      officeType: "caCommons" as const,
      party: PARTY[party as keyof typeof PARTY],
      seatsHeld,
    }))
);
