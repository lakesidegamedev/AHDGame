/**
 * Canada's opening 2027 political board as plain data: regional party
 * organization from the 2025 result, and the pending Commons formation.
 */
import type { StatePartyOrg } from "@/lib/db/types";
import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";
import { organizationFromVoteShare } from "@/lib/parties/rules/voteShareOrganization";
import { CA_PARTY_REGIONAL_RESTRICTIONS } from "../data/caParties";

export type CaStatePartyOrgRow = Omit<StatePartyOrg, "createdAt" | "updatedAt">;
export type CaFormationDoc = Omit<GovernmentFormation, "createdAt" | "updatedAt">;

/** Provincial associations levy a small share of party income, as in the UK. */
const REGIONAL_ASSOCIATION_TAX_RATE = 5;

/**
 * One organization row per region and seeded party. Organization scales from
 * the party's 2025 regional vote share and registration starts at that share.
 * Polling slugs without a seeded party are skipped, so a party pruned by the
 * preset roster never gets an orphan row.
 */
export function caStatePartyOrgRows(
  polling: Readonly<Record<string, Readonly<Record<string, number>>>>,
  slugToPartyId: Readonly<Record<string, string>>
): CaStatePartyOrgRow[] {
  const rows: CaStatePartyOrgRow[] = [];
  for (const [stateId, shares] of Object.entries(polling)) {
    for (const [slug, voteShare] of Object.entries(shares)) {
      const partyId = slugToPartyId[slug];
      if (!partyId) continue;
      rows.push({
        _id: `${stateId}_${partyId}`,
        countryId: "CA",
        stateId,
        partyId,
        organization: organizationFromVoteShare(voteShare),
        registration: voteShare,
        registrationShare: voteShare,
        chairId: null,
        viceChairId: null,
        treasurerId: null,
        treasury: 0,
        stateTaxRate: REGIONAL_ASSOCIATION_TAX_RATE,
        politicalStrength: 0,
        hasPresence: CA_PARTY_REGIONAL_RESTRICTIONS[slug]?.includes(stateId) ?? true,
        consecutiveLosses: 0,
      });
    }
  }
  return rows;
}

/** Map polling slugs to seeded party ids through the seeded display names. */
export function caSlugToPartyId(
  slugToName: Readonly<Record<string, string>>,
  parties: ReadonlyArray<{ name: string; sequentialId: number }>
): Record<string, string> {
  const idByName = new Map(parties.map((party) => [party.name, String(party.sequentialId)]));
  const out: Record<string, string> = {};
  for (const [slug, name] of Object.entries(slugToName)) {
    const id = idByName.get(name);
    if (id) out[slug] = id;
  }
  return out;
}

/** Simple majority of the Commons. */
export function commonsMajority(totalSeats: number): number {
  return Math.floor(totalSeats / 2) + 1;
}

/** The pending first formation cycle: the opening Commons election seats the government. */
export function caPendingFormation(
  commonsSeatsByRegion: Readonly<Record<string, number>>
): CaFormationDoc {
  const totalSeats = Object.values(commonsSeatsByRegion).reduce((sum, seats) => sum + seats, 0);
  return {
    _id: "CA",
    countryId: "CA",
    cycle: 1,
    status: "pending",
    formationType: null,
    lostMajority: false,
    pmCharacterId: null,
    pmNppId: null,
    pmName: null,
    governingPartyId: null,
    coalitionId: null,
    coalitionPartyIds: null,
    totalSeatsSupporting: 0,
    majorityThreshold: commonsMajority(totalSeats),
    seatsByParty: {},
    totalSeats,
    activeVoteId: null,
    formedAt: null,
    formedTurn: null,
    collapsedAt: null,
  };
}
