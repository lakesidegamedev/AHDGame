import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { getRegionalExecutive } from "@/lib/states/regionalExecutive";
import { getRegionalApprovalData } from "@/lib/states/approval/getRegionalApprovalData";
import { approvalCoattailMultiplier, coattailMultiplierMapToPct } from "./coattailMagnitude";

/**
 * A down-ballot general qualifies for the governor coattail when:
 *   - it is the general phase (primaries use a different engine), AND
 *   - it is NOT the executive's own office (no self-coattail), AND
 *   - it is NOT the head-of-government / presidential race (national).
 */
export function isCoattailEligibleRace(args: {
  isGeneralElection: boolean;
  electionType: string;
  regionalExecOfficeType: string | null;
  isOwnHeadOfGovernmentRace: boolean;
}): boolean {
  if (!args.isGeneralElection) return false;
  if (args.isOwnHeadOfGovernmentRace) return false;
  if (args.regionalExecOfficeType && args.electionType === args.regionalExecOfficeType)
    return false;
  return true;
}

/**
 * True when the race IS the sitting regional executive's own seat, the
 * in-state case `isCoattailEligibleRace` excludes. Feeds the governor's
 * approval into the incumbency driver for re-election. Single-winner
 * regional executives only.
 *
 * The US President is intentionally NOT covered: the presidential engine
 * already folds approval into a nominal-share strengthMultiplier, so routing
 * it here too would double-count.
 */
export function isOwnRegionalExecutiveRace(args: {
  isGeneralElection: boolean;
  electionType: string;
  regionalExecOfficeType: string | null;
  hasState: boolean;
}): boolean {
  if (!args.isGeneralElection) return false;
  return (
    args.hasState &&
    args.regionalExecOfficeType != null &&
    args.electionType === args.regionalExecOfficeType
  );
}

/**
 * Build the per-party coattail multiplier map. Only the executive's party gets
 * an entry, and only when it has a StatePartyOrg row in this state (so a stale
 * `electedOfficials.party` value no-ops to neutral).
 *
 * Magnitude is approval-based: neutral approval is 1.0x; above it lifts (up to
 * +COATTAIL_MAX_BONUS at +COATTAIL_APPROVAL_SATURATION points), below it drags
 * (down to 1 - COATTAIL_MAX_BONUS).
 */
export function buildGovModifierByParty(
  governor: { partyId: string; approval: number } | null,
  partyIdsInState: Set<string>
): Map<string, number> {
  const map = new Map<string, number>();
  if (!governor) return map;
  if (!partyIdsInState.has(governor.partyId)) return map;
  map.set(governor.partyId, approvalCoattailMultiplier(governor.approval));
  return map;
}

/**
 * Convert a govModifier multiplier map into signed percentage tilts for display
 * (e.g. 1.045 → +4.5). Pure; used by the persuasion-drivers card.
 */
export function govModifierToPct(modifier: Map<string, number>): Record<string, number> {
  return coattailMultiplierMapToPct(modifier);
}

/** Use the same snapshot or complete live fallback as the regional approval page. */
export async function resolveGovExecutiveApproval(
  db: Db,
  countryId: CountryId,
  stateId: string
): Promise<{ partyId: string; approval: number } | null> {
  const exec = await getRegionalExecutive(db, countryId, stateId);
  if (!exec?.partyId) return null;

  const data = await getRegionalApprovalData(db, countryId, stateId.toUpperCase());
  return data ? { partyId: exec.partyId, approval: data.approval } : null;
}
