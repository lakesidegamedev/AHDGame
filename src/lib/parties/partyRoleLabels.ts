import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import type {
  PartyCommitteeTitles,
  PartyLeadershipTitleKey,
  PartyLeadershipTitles,
} from "@/lib/db/types/party";

export type PartyRoleLabelKey = PartyLeadershipTitleKey | "committee";

export const MAX_PARTY_LEADERSHIP_TITLE_LENGTH = 40;

const DEFAULT_PARTY_ROLE_LABELS: Record<PartyRoleLabelKey, string> = {
  chair: "National Chair",
  viceChair: "National Vice Chair",
  treasurer: "National Treasurer",
  committee: "National Committee",
};
const OFFICER_ROLES: readonly PartyLeadershipTitleKey[] = ["chair", "viceChair", "treasurer"];

function standardPartyRoleLabel(countryId: string, key: PartyRoleLabelKey): string {
  const config = COUNTRY_CLIENT_CONFIGS[countryId.toUpperCase() as CountryId];
  return config?.partyRoleLabels?.[key] ?? DEFAULT_PARTY_ROLE_LABELS[key];
}

export function partyRoleTitleConflicts(
  countryId: string,
  key: PartyLeadershipTitleKey,
  titles: PartyLeadershipTitles
): boolean {
  const title = titles[key]?.trim().toLowerCase();
  if (!title) return false;
  return OFFICER_ROLES.some(
    (role) =>
      role !== key &&
      (title === standardPartyRoleLabel(countryId, role).toLowerCase() ||
        title === titles[role]?.trim().toLowerCase())
  );
}

/**
 * Country-aware label for a party leadership / committee role. A party title
 * override takes precedence for its national leadership roles.
 *
 * Accepts any string for ergonomics at client call sites (route `[code]` params
 * arrive as lowercase strings). Normalizes case and falls back to the default
 * English label when the country is unknown or defines no override.
 */
export function getPartyRoleLabel(
  countryId: string,
  key: PartyRoleLabelKey,
  leadershipTitles?: PartyLeadershipTitles | null
): string {
  if (key !== "committee" && leadershipTitles) {
    const partyTitle = leadershipTitles[key]?.trim();
    if (partyTitle && !partyRoleTitleConflicts(countryId, key, leadershipTitles)) return partyTitle;
  }
  return standardPartyRoleLabel(countryId, key);
}

export const DEFAULT_COMMITTEE_MEMBER_TITLE = "Committeeman";

export function getNationalCommitteeName(countryId: string, titles?: PartyCommitteeTitles): string {
  return titles?.name?.trim() || getPartyRoleLabel(countryId, "committee");
}

export function getCommitteeMemberTitle(memberId: string, titles?: PartyCommitteeTitles): string {
  return (
    titles?.byMember?.[memberId]?.trim() || titles?.member?.trim() || DEFAULT_COMMITTEE_MEMBER_TITLE
  );
}
