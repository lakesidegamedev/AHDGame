import { resolvePartyTurnoutTarget } from "./turnoutTargets";

export interface PartyTurnoutTargetLean {
  economicLean: number;
  socialLean: number;
}

/** Resolve a party GOTV or suppression target against the country's census buckets. */
export function resolvePartyTurnoutTargetLean(
  countryId: string,
  category: string,
  group: string,
  preset?: string | null
): PartyTurnoutTargetLean | null {
  return resolvePartyTurnoutTarget(countryId, category, group, preset);
}

export function isValidPartyTurnoutTarget(
  countryId: string,
  category: string,
  group: string,
  preset?: string | null
): boolean {
  return resolvePartyTurnoutTargetLean(countryId, category, group, preset) !== null;
}
