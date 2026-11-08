import { getCnNpcSeats, getCnPeoplesCongressSeats } from "@/lib/constants";
import { defineChamberSpec } from "@/lib/turn/perpetualElections/chamberSpec";

/** National People's Congress delegations: one multi-seat race per region, sized by era. */
export const CN_NPC_DELEGATE_SPEC = defineChamberSpec({
  chamberId: "npcDelegate",
  countryId: "CN",
  electionType: "npcDelegate",
  constituencies: "regions",
  seats: { kind: "presetTable", tableFor: getCnNpcSeats, enforce: "positive", missing: "throw" },
  electoralSystem: "list",
  cycle: { anchor: "cnNpcDelegate", periodHours: 240 },
  gate: "always",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: true,
});

/** Provincial People's Congresses, on the same five-year clock as the NPC. */
export const CN_PEOPLES_CONGRESS_SPEC = defineChamberSpec({
  chamberId: "peoplesCongress",
  countryId: "CN",
  electionType: "peoplesCongress",
  constituencies: "regions",
  seats: {
    kind: "presetTable",
    tableFor: getCnPeoplesCongressSeats,
    enforce: "positive",
    missing: "throw",
  },
  electoralSystem: "list",
  cycle: { anchor: "cnNpcDelegate", periodHours: 240 },
  gate: "always",
  lateJoiners: "ownCycle",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: true,
});

/** Regional governors: one seat per macro-region on the shared governor cycle. */
export const CN_GOVERNOR_SPEC = defineChamberSpec({
  chamberId: "governor",
  countryId: "CN",
  electionType: "governor",
  constituencies: "regions",
  seats: { kind: "single", forceSeat: true },
  electoralSystem: "plurality",
  cycle: { anchor: "governorStateSenate", periodHours: 192 },
  gate: "always",
  lateJoiners: "mirrorLivePeer",
  openPrimaryImmediately: true,
  byElections: "none",
  snap: "none",
  healLiveSeats: false,
});

export const CN_CHAMBER_SPECS = [
  CN_NPC_DELEGATE_SPEC,
  CN_PEOPLES_CONGRESS_SPEC,
  CN_GOVERNOR_SPEC,
] as const;
