import { defineChamberSpec } from "@/lib/turn/perpetualElections/chamberSpec";
import { IE_LOCAL_COUNCIL_SEATS } from "../data/ieLocalCouncilSeats";

/** Dáil Éireann: PR-STV constituencies sized by each region's seeded `houseDistricts`. */
export const IE_DAIL_SPEC = defineChamberSpec({
  chamberId: "dail",
  countryId: "IE",
  electionType: "dail",
  constituencies: "regions",
  seats: { kind: "stateField", field: "houseDistricts", missing: "oneSeat" },
  electoralSystem: "stv",
  cycle: { anchor: "ieDail", periodHours: 192 },
  gate: "always",
  lateJoiners: "mirrorLivePeer",
  openPrimaryImmediately: true,
  byElections: "none",
});

/** Uachtarán na hÉireann: one nationwide seat on a seven-year cycle. */
export const IE_UACHTARAN_SPEC = defineChamberSpec({
  chamberId: "uachtaran",
  countryId: "IE",
  electionType: "uachtaran",
  constituencies: "nation",
  seats: { kind: "single" },
  electoralSystem: "plurality",
  cycle: { anchor: "ieUachtaran", periodHours: 336 },
  gate: "always",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
});

/** Local councils: every region votes together, sized from the council seat table. */
export const IE_LOCAL_COUNCIL_SPEC = defineChamberSpec({
  chamberId: "localCouncil",
  countryId: "IE",
  electionType: "localCouncil",
  constituencies: "regions",
  seats: { kind: "table", table: IE_LOCAL_COUNCIL_SEATS, missing: "oneSeat" },
  electoralSystem: "stv",
  cycle: { anchor: "ieLocalCouncil", periodHours: 240 },
  gate: "always",
  lateJoiners: "mirrorLivePeer",
  openPrimaryImmediately: true,
  byElections: "none",
});

export const IE_CHAMBER_SPECS = [IE_DAIL_SPEC, IE_UACHTARAN_SPEC, IE_LOCAL_COUNCIL_SPEC] as const;
