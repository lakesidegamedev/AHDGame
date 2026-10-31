import { clamp } from "@/lib/numeric/rules";
import type { CountryId } from "@/lib/constants/countries";
import { COUNTRY_CONFIGS, getMajorPartiesForRegion } from "@/lib/constants/countries";
import { FPTP_SPOILER_RATE } from "../constants";
import { partitionMajorParties } from "../majorParties";

interface SpoilerCandidate {
  candidateId: string;
  party: string;
  charEP: number;
  charSP: number;
}

export interface SpoilerTransferOptions {
  countryId?: CountryId;
  parentRegionId?: string;
  spoilerRate?: number;
  useOrgAwareSpoiler?: boolean;
}

export interface SpoilerGateOptions {
  votingSystem?: string;
  isOnePartyState?: boolean;
  countryId?: CountryId;
}

/**
 * Whether the FPTP spoiler step runs for a general election. RCV removes the
 * spoiler. One-party states skip it too: the regime multiplier already encodes
 * ruling-vs-approved dominance, so "third party bleeds the major" does not
 * describe that landscape. Prefer the runtime `isOnePartyState` (resolved from
 * countryState by the caller, so a mid-game conversion takes effect at once);
 * the compile-time config is only a fallback for hand-built fixtures.
 */
export function shouldApplyFptpSpoiler(options: SpoilerGateOptions = {}): boolean {
  if (options.votingSystem === "rcv") return false;
  const isOnePartyState =
    options.isOnePartyState ??
    (options.countryId != null &&
      COUNTRY_CONFIGS[options.countryId]?.governmentType === "onePartyState");
  return !isOnePartyState;
}

function spoilerOrgFactor(thirdPartyOrg: number | undefined, majorOrg: number | undefined): number {
  const third = clamp(thirdPartyOrg ?? 0, 0, 100);
  const major = clamp(majorOrg ?? 0, 0, 100);
  return clamp(1 + (third - major) / 100, 0.25, 2);
}

/** Apply the shared post-allocation FPTP spoiler transfer in place. */
export function applyFptpSpoilerTransfers(
  candidates: readonly SpoilerCandidate[],
  votesByCandidate: Record<string, number>,
  partyOrganization: ReadonlyMap<string, number>,
  options: SpoilerTransferOptions = {}
): void {
  const majorPartySet = getMajorPartiesForRegion(options.countryId ?? "US", options.parentRegionId);
  const { major, third } = partitionMajorParties(
    candidates,
    majorPartySet,
    (candidate) => votesByCandidate[candidate.candidateId] ?? 0
  );
  if (third.length === 0 || major.length === 0) return;

  const rate = options.spoilerRate ?? FPTP_SPOILER_RATE;
  for (const thirdParty of third) {
    let nearest = major[0];
    let minimumDistance = Infinity;
    for (const majorParty of major) {
      const distance =
        Math.abs(thirdParty.charEP - majorParty.charEP) +
        Math.abs(thirdParty.charSP - majorParty.charSP);
      if (distance < minimumDistance) {
        minimumDistance = distance;
        nearest = majorParty;
      }
    }
    const organizationFactor = options.useOrgAwareSpoiler
      ? spoilerOrgFactor(
          partyOrganization.get(thirdParty.party),
          partyOrganization.get(nearest.party)
        )
      : 1;
    const requested = (votesByCandidate[thirdParty.candidateId] ?? 0) * rate * organizationFactor;
    const transferred = Math.min(requested, votesByCandidate[nearest.candidateId] ?? 0);
    votesByCandidate[nearest.candidateId] -= transferred;
    votesByCandidate[thirdParty.candidateId] += transferred;
  }
}
