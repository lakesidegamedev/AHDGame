import type { OfficeHolders } from "./accountability";
import type { CrisisRole, CrisisScope } from "./types";

/** Where a holder's responsibilities sit, for the roles tied to a place. */
export interface HolderFootprint {
  /** The state a governor runs. */
  stateId?: string;
  /** Sector footprint of the corporations a CEO runs. */
  holdings?: readonly { stateId: string; sectorType: string }[];
}

export interface CrisisReach {
  scope: CrisisScope;
  /** Every state the crisis touches. */
  stateIds: ReadonlySet<string>;
  /** Sectors the crisis reaches; absent = all. */
  sectors?: readonly string[];
}

const BROAD_SCOPES: ReadonlySet<CrisisScope> = new Set(["national", "global"]);

/**
 * Whether a holder answers for a crisis. Blame follows exposure: a governor
 * for a state the crisis reaches, a CEO for a corporation operating in an
 * affected sector and region, party leaders and the legislature only when the
 * whole country is in play.
 */
export function holderExposed(
  role: CrisisRole,
  footprint: HolderFootprint | undefined,
  reach: CrisisReach
): boolean {
  const broad = BROAD_SCOPES.has(reach.scope);
  switch (role) {
    case "headOfState":
      return true;
    case "financeMinister":
    case "centralBankChair":
    case "legislature":
    case "partyLeader":
      return broad;
    case "stateGovernor":
      if (broad) return true;
      return footprint?.stateId !== undefined && reach.stateIds.has(footprint.stateId);
    case "corpCeo":
      return (footprint?.holdings ?? []).some(
        (holding) =>
          reach.stateIds.has(holding.stateId) &&
          (!reach.sectors || reach.sectors.includes(holding.sectorType))
      );
  }
}

/** Keeps only the holders who answer for the crisis. */
export function filterExposedHolders(
  holders: OfficeHolders,
  footprints: ReadonlyMap<string, HolderFootprint>,
  reach: CrisisReach
): OfficeHolders {
  const result: OfficeHolders = {};
  for (const [role, ids] of Object.entries(holders) as [CrisisRole, readonly string[]][]) {
    const kept = ids.filter((id) => holderExposed(role, footprints.get(id), reach));
    if (kept.length > 0) result[role] = kept;
  }
  return result;
}
