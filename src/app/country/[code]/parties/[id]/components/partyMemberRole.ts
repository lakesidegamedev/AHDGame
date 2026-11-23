import { getPartyRoleLabel } from "@/lib/parties/partyRoleLabels";
import type { PartyData } from "./types";

/** Every national office a character holds, labelled the same way the overview labels them. */
export function partyMemberOfficeLabels(
  party: Pick<PartyData, "countryId" | "chair" | "viceChair" | "treasurer" | "leadershipTitles">,
  characterId: string
): string[] {
  const offices = [
    ["chair", party.chair],
    ["viceChair", party.viceChair],
    ["treasurer", party.treasurer],
  ] as const;
  return offices
    .filter(([, holder]) => holder?.id === characterId)
    .map(([key]) => getPartyRoleLabel(party.countryId, key, party.leadershipTitles));
}
