import type { ElectionVoteTally } from "@/lib/db/types";
import type { ElectionResponse } from "./electionResponseTypes";

/** The tally's stored primary results, trimmed to what a finished view shows. */
export function finishedPrimaryResults(
  results: NonNullable<ElectionVoteTally["primaryResults"]>
): NonNullable<ElectionResponse["primaryResults"]> {
  const out: NonNullable<ElectionResponse["primaryResults"]> = {};
  for (const [partyId, rows] of Object.entries(results.byParty ?? {})) {
    out[partyId] = rows.map((r) => ({
      candidateId: r.candidateId,
      characterName: r.characterName,
      sharePct: r.sharePct,
      won: r.won,
    }));
  }
  return out;
}
