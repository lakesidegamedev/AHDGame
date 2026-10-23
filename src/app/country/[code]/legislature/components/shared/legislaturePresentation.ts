import type { CountryId } from "@/lib/constants/countries";
import type { LegislatureCompositionData } from "@/components/legislature/types";
import type { BillDisplay } from "@/lib/legislature/dto/billDisplay";
import type { BillVoteFilter } from "@/components/bills/BillListControls";
import {
  matchesLegislatureBillStatusFilter,
  type LegislatureBillStatusFilter,
} from "@/lib/legislature/billStatusFilters";
import type { MembersData } from "./useLegislatureData";

export const LEGISLATURE_STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "voting", label: "Voting" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
] satisfies Array<{ value: LegislatureBillStatusFilter; label: string }>;

/** Adapt the API's member rows without changing country-specific identities or avatars. */
export function legislatureCompositionData(
  members: MembersData,
  countryId: CountryId,
  {
    includeAvatars = false,
    memberId = (member) => member.characterId,
  }: {
    includeAvatars?: boolean;
    memberId?: (member: MembersData["members"][number]) => string;
  } = {}
): LegislatureCompositionData {
  return {
    members: members.members.map((mp) => ({
      id: memberId(mp),
      characterId: mp.characterId,
      sequentialId: mp.sequentialId ?? null,
      characterName: mp.characterName,
      ...(includeAvatars ? { avatarUrl: mp.avatarUrl } : {}),
      region: mp.constituency,
      party: mp.party,
      partyName: mp.partyName,
      partyColor: mp.partyColor,
      countryId,
      seatsHeld: mp.seatsHeld,
      isNPP: mp.isNPP,
      isVacant: false,
    })),
    composition: members.composition.map((c) => ({
      party: c.partyId,
      partyName: c.partyName,
      partyColor: c.partyColor,
      economicPosition: c.economicPosition,
      seats: c.seats,
      countryId,
    })),
    totalSeats: members.totalSeats,
    filledSeats: members.filledSeats,
  };
}

export function filterLegislatureBills(
  bills: BillDisplay[],
  voteFilter: BillVoteFilter,
  statusFilter?: LegislatureBillStatusFilter
): BillDisplay[] {
  // Vote-only pages retain their original array when no filter is applied.
  if (statusFilter === undefined) {
    if (voteFilter === "voted") return bills.filter((bill) => bill.myVote != null);
    if (voteFilter === "not_voted") return bills.filter((bill) => bill.myVote == null);
    return bills;
  }
  return bills.filter((bill) => {
    if (!matchesLegislatureBillStatusFilter(bill.status, statusFilter)) return false;
    if (voteFilter === "voted") return bill.myVote != null;
    if (voteFilter === "not_voted") return bill.myVote == null;
    return true;
  });
}
