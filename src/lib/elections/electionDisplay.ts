import type { ElectionResponse } from "@/lib/elections/resolveElection";
import type { ElectionDisplay } from "@/lib/db/types";
import { isCommonsGeneralElection } from "@/lib/utils/electionLabels";

/** Shape of GET /api/elections list responses (country/list mode). */
export interface ElectionsPageResponse<Election = ElectionResponse> {
  elections?: Election[];
  total?: number;
  page?: number;
}

/**
 * Maps an ElectionResponse (from the unified service) to ElectionDisplay (used by
 * components). Lives in a shared, non-"use client" module so both the client page
 * and the server component that seeds it can call it (a server component cannot
 * call a function imported from a "use client" file).
 *
 * Summary-mode responses omit generalTally (it's in generalVotes which is null in
 * summary mode) — ElectionCard handles their absence gracefully via optional chaining.
 */
export function toElectionDisplay(e: ElectionResponse): ElectionDisplay {
  return {
    id: e.id,
    seatId: e.seatId ?? undefined,
    electionType: e.electionType,
    state: e.state,
    countryId: e.countryId,
    hungarianAssemblyRound: e.hungarianAssemblyRound,
    russianDumaRound: e.russianDumaRound,
    senateClass: e.senateClass ?? undefined,
    chamberClass: e.chamberClass ?? undefined,
    cycle: e.cycle,
    electionYear: e.electionYear ?? undefined,
    status: e.status,
    viewerWithdrew: e.viewerWithdrew,
    totalSeats: e.totalSeats ?? undefined,
    startTime: e.startTime ? String(e.startTime) : undefined,
    endTime: e.endTime ? String(e.endTime) : undefined,
    primaryEndTime: e.primaryEndTime ? String(e.primaryEndTime) : undefined,
    startTurn: e.startTurn ?? undefined,
    endTurn: e.endTurn ?? undefined,
    primaryEndTurn: e.primaryEndTurn ?? undefined,
    durationHours: e.durationHours ?? undefined,
    primaryDurationHours: e.primaryDurationHours ?? undefined,
    inPrimary: e.inPrimary,
    polling: e.polling ?? undefined,
    seatsEstimate: e.seatsEstimate ?? undefined,
    primaryVotes: e.primaryVotes ?? undefined,
    incumbent: e.incumbent
      ? {
          name: e.incumbent.name,
          party: e.incumbent.party,
          partyColor: e.incumbent.partyColor ?? undefined,
          running: e.incumbent.running,
          notRunningReason: e.incumbent.notRunningReason ?? null,
        }
      : undefined,
    candidates: e.candidates.map((c) => ({
      id: c.id,
      characterId: c.characterId ?? "",
      characterName: c.characterName,
      avatarUrl: c.avatarUrl,
      party: c.party,
      partyName: c.partyName,
      partyColor: c.partyColor,
      isNPP: c.isNPP,
      nppId: c.nppId ?? undefined,
      endorsements: (c.endorsements ?? [])
        .filter((en) => en.type === "npp" && en.nppId && en.nppName)
        .map((en) => ({ nppId: en.nppId!, nppName: en.nppName! })),
    })),
  };
}

/** Keeps only the leader's entry; the list and its map read nothing else. */
function leaderOnly<T>(map: Record<string, T> | undefined, leaderId: string | null) {
  if (!map) return map;
  return leaderId && leaderId in map ? { [leaderId]: map[leaderId] } : {};
}

/**
 * Trims a display election to what the country elections list renders: row
 * cells, section counts, the region map and the viewer's own-race check. Commons
 * general elections keep their candidates and party maps for the seat carve-up.
 */
export function toElectionListDisplay(e: ElectionResponse): ElectionDisplay {
  const full = toElectionDisplay(e);
  const commons = isCommonsGeneralElection(full.electionType);
  const polling = full.polling;
  const leaderId = polling?.leaderId ?? null;
  return {
    ...full,
    startTime: undefined,
    endTime: undefined,
    primaryVotes: undefined,
    polling: polling
      ? {
          ...polling,
          candidateNames: {},
          ...(commons
            ? {}
            : {
                candidateParties: leaderOnly(polling.candidateParties, leaderId) ?? {},
                candidatePartyNames: leaderOnly(polling.candidatePartyNames, leaderId),
                candidatePartyColors: leaderOnly(polling.candidatePartyColors, leaderId),
              }),
        }
      : undefined,
    candidates: full.candidates.map((c) =>
      commons
        ? {
            id: c.id,
            characterId: c.characterId,
            characterName: c.characterName,
            party: c.party,
            partyName: c.partyName,
            partyColor: c.partyColor,
            isNPP: c.isNPP,
          }
        : { id: c.id, characterId: c.isNPP ? "" : c.characterId, characterName: "", party: "" }
    ),
  };
}
